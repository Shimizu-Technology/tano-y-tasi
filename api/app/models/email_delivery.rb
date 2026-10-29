class EmailDelivery < ApplicationRecord
  belongs_to :order
  validates :kind, inclusion: { in: %w[order_confirmation admin_new_order order_shipped] }
  validates :status, inclusion: { in: %w[pending sent failed skipped] }
  validates :to, format: { with: URI::MailTo::EMAIL_REGEXP }

  def idempotency_key
    key = "#{kind}-#{order.token}"
    key += "-#{Digest::SHA256.hexdigest(to)[0, 16]}" if kind == "admin_new_order"
    resend_number.positive? ? "#{key}-resend-#{resend_number}" : key
  end

  def deliver!(resend: false)
    if ActiveRecord::Base.connection.transaction_open?
      # Rails may invoke callbacks immediately for a nonjoinable test/fixture
      # transaction. Leave this row pending for the recovery task in that case.
      return self unless ActiveRecord::Base.connection.current_transaction.joinable?
      ActiveRecord::Base.current_transaction.after_commit { deliver!(resend: resend) }
      return self
    end
    AdminLock.with("email-delivery-#{id}") do
      reload
      return self if !resend && (%w[sent skipped].include?(status) || attempts >= 5)
      update!(resend_number: attempts + 1, outbound_payload: {}) if resend
      unless ActiveModel::Type::Boolean.new.cast(ENV.fetch("EMAIL_DELIVERY_ENABLED", "false"))
        update!(status: "skipped", last_error: nil)
        return self
      end
      begin
        update!(attempts: attempts + 1, status: "pending")
        raise "RESEND_API_KEY and MAILER_FROM_EMAIL are required" if ENV["RESEND_API_KEY"].blank? || ENV["MAILER_FROM_EMAIL"].blank?
        update!(outbound_payload: Emails::Template.payload(self)) if outbound_payload.empty?
        Resend.api_key = ENV.fetch("RESEND_API_KEY")
        response = Resend::Emails.send(outbound_payload, options: { idempotency_key: idempotency_key })
        message_id = response[:id] || response["id"]
        raise "Resend did not return a message ID" if message_id.blank?
        update!(status: "sent", provider_message_id: message_id, sent_at: Time.current, last_error: nil)
      rescue StandardError => error
        update!(status: "failed", last_error: "Email delivery failed (#{error.class})")
        Rails.logger.error("EMAIL_DELIVERY_FAILED delivery_id=#{id} error=#{error.class}")
      end
    end
    self
  rescue StandardError => error
    # Provider or recording errors must never undo a completed payment.
    Rails.logger.error("EMAIL_DELIVERY_UNAVAILABLE delivery_id=#{id} error=#{error.class}")
    self
  end
end
