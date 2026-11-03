module Payments
  class IssueRefund
    def self.call(order, amount_cents: nil)
      ProviderLease.with("refund-#{order.id}") do
        order.reload
        unless %w[paid needs_attention].include?(order.status) && order.paid_at
          raise ApiError.new("invalid_refund", "Only paid orders can be refunded.")
        end
        remaining = order.total_cents - order.refunded_cents
        amount = amount_cents.nil? ? remaining : amount_cents
        unless amount.is_a?(Integer) && amount.between?(1, remaining)
          raise ApiError.new("invalid_refund", "Enter a refund between $0.01 and #{Emails::Template.money(remaining)}.")
        end
        total = order.refunded_cents + amount
        create_provider_refund(order, amount) if order.provider == "stripe"
        ApplyRefund.call(order, refunded_cents: total)
      end
    end

    def self.create_provider_refund(order, amount)
      raise ApiError.new("invalid_refund", "This order has no Stripe payment to refund.") if order.provider_payment_intent_id.blank?
      Stripe::Refund.create({ payment_intent: order.provider_payment_intent_id, amount: amount, metadata: { order_number: order.number } },
        { idempotency_key: "tano-y-tasi-refund-#{order.token}-#{order.refunded_cents}-#{amount}" })
    rescue Stripe::InvalidRequestError, Stripe::CardError => error
      Rails.logger.error("REFUND_REJECTED order_id=#{order.id} error=#{error.class}")
      raise ApiError.new("refund_rejected", "Stripe rejected this refund: #{error.message}")
    rescue Stripe::StripeError, IOError, Timeout::Error, SocketError => error
      Rails.logger.error("REFUND_RETRYABLE order_id=#{order.id} error=#{error.class}")
      raise ApiError.new("payment_unavailable", "Stripe is unavailable. Try the refund again.", status: :service_unavailable)
    end
    private_class_method :create_provider_refund
  end
end
