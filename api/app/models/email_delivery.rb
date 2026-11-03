class EmailDelivery < ApplicationRecord
  belongs_to :order
  validates :kind, inclusion: { in: %w[order_confirmation admin_new_order admin_attention order_shipped order_refunded] }
  validates :status, inclusion: { in: %w[pending sent failed skipped] }
  validates :to, format: { with: URI::MailTo::EMAIL_REGEXP }
  scope :retryable, -> { where(status: %w[pending failed]).where("attempts < ?", 5) }

  def idempotency_key
    key = "#{kind}-#{order.token}"
    key += "-#{Digest::SHA256.hexdigest(to)[0, 16]}" if kind.start_with?("admin_")
    resend_number.positive? ? "#{key}-resend-#{resend_number}" : key
  end

  # Persists a new alert for this row, so a crash before sending leaves retryable
  # work behind. The new key keeps Resend from treating it as the earlier email.
  def requeue!
    update!(status: "pending", resend_number: resend_number + 1, attempts: 0, outbound_payload: {}, last_error: nil, sent_at: nil, provider_message_id: nil)
  end

  def deliver!(resend: false)
    if ActiveRecord::Base.connection.transaction_open?
      # Rails may invoke callbacks immediately for a nonjoinable test/fixture
      # transaction. Leave this row pending for the recovery task in that case.
      return self unless ActiveRecord::Base.connection.current_transaction.joinable?
      ActiveRecord::Base.current_transaction.after_commit { deliver!(resend: resend) }
      return self
    end
    ProviderLease.with("email-delivery-#{id}") do
      reload
      return self if !resend && (%w[sent skipped].include?(status) || attempts >= 5)
      update!(resend_number: resend_number + 1, outbound_payload: {}) if resend
      # requeue! can run during a send. Everything recorded from here applies only
      # to this generation, so an older send can't erase a newer alert.
      generation = resend_number
      unless ActiveModel::Type::Boolean.new.cast(ENV.fetch("EMAIL_DELIVERY_ENABLED", "false"))
        record(generation, status: "skipped", last_error: nil)
        return self
      end
      begin
        update!(attempts: attempts + 1, status: "pending")
        raise "RESEND_API_KEY and MAILER_FROM_EMAIL are required" if ENV["RESEND_API_KEY"].blank? || ENV["MAILER_FROM_EMAIL"].blank?
        payload = outbound_payload.presence || Emails::Template.payload(self).deep_stringify_keys
        record(generation, outbound_payload: payload)
        Resend.api_key = ENV.fetch("RESEND_API_KEY")
        response = Resend::Emails.send(payload, options: { idempotency_key: idempotency_key })
        message_id = response[:id] || response["id"]
        raise "Resend did not return a message ID" if message_id.blank?
        record(generation, status: "sent", provider_message_id: message_id, sent_at: Time.current, last_error: nil)
      rescue StandardError => error
        record(generation, status: "failed", last_error: "Email delivery failed (#{error.class})")
        Rails.logger.error("EMAIL_DELIVERY_FAILED delivery_id=#{id} error=#{error.class}")
      end
    end
    self
  rescue StandardError => error
    # Provider or recording errors must never undo a completed payment.
    Rails.logger.error("EMAIL_DELIVERY_UNAVAILABLE delivery_id=#{id} error=#{error.class}")
    self
  end

  private

  def record(generation, attributes)
    self.class.where(id: id, resend_number: generation).update_all(attributes.merge(updated_at: Time.current))
    reload
  end
end
