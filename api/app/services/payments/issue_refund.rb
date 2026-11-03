module Payments
  class IssueRefund
    RETRY_MESSAGE = "We couldn't confirm that refund with Stripe. Retry the same amount; it won't refund twice.".freeze

    def self.call(order, amount_cents: nil)
      ProviderLease.with("refund-#{order.id}") do
        order.reload
        unless %w[paid needs_attention].include?(order.status) && order.paid_at
          raise ApiError.new("invalid_refund", "Only paid orders can be refunded.")
        end
        request = request_for(order, amount_cents)
        if order.provider == "stripe"
          refund = provider_refund(order, request)
          request.update!(status: "completed", provider_refund_id: refund[:id])
          sync(order)
        else
          request.update!(status: "completed")
          ApplyRefund.call(order, refunded_cents: order.refunded_cents + request.amount_cents)
        end
      end
      order.reload
    end

    def self.request_for(order, amount_cents)
      open = order.refund_requests.open.first
      if open
        return open if amount_cents.nil? || amount_cents == open.amount_cents
        raise ApiError.new("refund_in_progress", "A #{Emails::Template.money(open.amount_cents)} refund hasn't been confirmed yet. Retry that amount first.")
      end
      remaining = order.paid_cents - order.refunded_cents
      amount = amount_cents.nil? ? remaining : amount_cents
      unless amount.is_a?(Integer) && amount.between?(1, remaining)
        raise ApiError.new("invalid_refund", "Enter a refund between $0.01 and #{Emails::Template.money(remaining)}.")
      end
      order.refund_requests.create!(amount_cents: amount)
    end

    def self.provider_refund(order, request)
      raise ApiError.new("invalid_refund", "This order has no Stripe payment to refund.") if order.provider_payment_intent_id.blank?
      # Stripe forgets idempotency keys after about a day, so look for the earlier attempt first.
      existing = Stripe::Refund.list({ payment_intent: order.provider_payment_intent_id, limit: 100 }).auto_paging_each.find do |refund|
        refund[:metadata] && refund[:metadata][:refund_request_id] == request.id.to_s
      end
      existing || Stripe::Refund.create({ payment_intent: order.provider_payment_intent_id, amount: request.amount_cents,
        metadata: { order_number: order.number, refund_request_id: request.id } }, { idempotency_key: "tano-y-tasi-refund-#{request.idempotency_key}" })
    rescue Stripe::InvalidRequestError => error
      request.update!(status: "rejected")
      Rails.logger.error("REFUND_REJECTED order_id=#{order.id} error=#{error.class}")
      raise ApiError.new("refund_rejected", "Stripe rejected this refund: #{error.message}")
    rescue Stripe::StripeError, IOError, Timeout::Error, SocketError => error
      Rails.logger.error("REFUND_RETRYABLE order_id=#{order.id} error=#{error.class}")
      raise ApiError.new("payment_unavailable", RETRY_MESSAGE, status: :service_unavailable)
    end

    # The refund exists at Stripe by now; its webhook repairs the order if this read fails.
    def self.sync(order)
      SyncProviderState.call(order)
    rescue Stripe::StripeError, IOError, Timeout::Error, SocketError => error
      Rails.logger.warn("REFUND_SYNC_DEFERRED order_id=#{order.id} error=#{error.class}")
    end
    private_class_method :request_for, :provider_refund, :sync
  end
end
