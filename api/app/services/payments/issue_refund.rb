module Payments
  class IssueRefund
    RETRY_MESSAGE = "We couldn't confirm that refund with Stripe. Retry the same amount; it won't refund twice.".freeze

    # key identifies one refund attempt in the admin's browser. Repeating it after an
    # unclear response can never start another refund, whatever happened in between.
    def self.call(order, amount_cents: nil, key: nil)
      # Shared with buying a label, so a label can't be bought for an order being refunded.
      ProviderLease.with("money-#{order.id}") do
        order.reload
        stored_key = key && "#{order.id}-#{key}"
        attempt = stored_key && order.refund_requests.find_by(idempotency_key: stored_key)
        if attempt&.status == "completed"
          sync(order)
          next
        end
        raise ApiError.new("refund_rejected", "Stripe rejected this refund. Check the amount and try again.") if attempt&.status == "rejected"
        open = order.refund_requests.open.first
        unless open || (%w[paid needs_attention].include?(order.status) && order.paid_at)
          raise ApiError.new("invalid_refund", "Only paid orders can be refunded.")
        end
        request = open_request(order, open, amount_cents, stored_key)
        if order.provider == "stripe"
          provider_refund(order, request)
          # The request closes once the order reflects it, so nothing new starts before then.
          raise ApiError.new("payment_unavailable", RETRY_MESSAGE, status: :service_unavailable) unless sync(order)
        else
          request.update!(status: "completed")
          ApplyRefund.call(order, refunded_cents: order.refunded_cents + request.amount_cents)
        end
      end
      order.reload
    end

    def self.open_request(order, open, amount_cents, stored_key)
      if open
        return open if amount_cents.nil? || amount_cents == open.amount_cents
        raise ApiError.new("refund_in_progress", "A #{Emails::Template.money(open.amount_cents)} refund hasn't been confirmed yet. Retry that amount first.")
      end
      remaining = order.paid_cents - order.refunded_cents
      amount = amount_cents.nil? ? remaining : amount_cents
      unless amount.is_a?(Integer) && amount.between?(1, remaining)
        raise ApiError.new("invalid_refund", "Enter a refund between $0.01 and #{Emails::Template.money(remaining)}.")
      end
      order.refund_requests.create!(amount_cents: amount, idempotency_key: stored_key)
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

    def self.sync(order)
      SyncProviderState.call(order)
      true
    rescue *SyncProviderState::RETRYABLE => error
      Rails.logger.warn("REFUND_SYNC_DEFERRED order_id=#{order.id} error=#{error.class}")
      false
    end
    private_class_method :open_request, :provider_refund, :sync
  end
end
