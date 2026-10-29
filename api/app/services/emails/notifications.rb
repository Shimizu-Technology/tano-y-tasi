module Emails
  module Notifications
    def self.paid(order)
      queue(order, "order_confirmation", order.email)
      configured = ENV["ADMIN_NOTIFICATION_EMAILS"]
      emails = configured ? configured.split(",").map { |email| email.strip.downcase }.reject(&:blank?) : User.admins.pluck(:email)
      emails.uniq.each { |email| queue(order, "admin_new_order", email) }
    rescue StandardError => error
      Rails.logger.error("EMAIL_NOTIFICATION_FAILED order_id=#{order.id} error=#{error.class}")
    end

    def self.shipped(order)
      queue(order, "order_shipped", order.email)
    end

    def self.queue(order, kind, to)
      delivery = EmailDelivery.find_or_create_by!(order: order, kind: kind, to: to) do |row|
        row.subject = Template.subject(kind, order)
      end
      ActiveRecord.after_all_transactions_commit { delivery.deliver! }
      delivery
    rescue StandardError => error
      Rails.logger.error("EMAIL_QUEUE_FAILED order_id=#{order.id} kind=#{kind} error=#{error.class}")
      nil
    end
  end
end
