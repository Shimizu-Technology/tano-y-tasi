module Payments
  # Reads refunds and disputes straight from Stripe. Events can arrive late, repeat
  # or carry stale snapshots; the current state cannot. Call outside locks.
  class SyncProviderState
    RETRYABLE = [ Stripe::StripeError, IOError, Timeout::Error, SocketError, ProviderLease::Busy ].freeze
    COUNTED_REFUNDS = %w[pending requires_action succeeded].freeze
    FAILED_REFUNDS = %w[failed canceled].freeze

    # The lease covers the read and the write, so an older read can't overwrite a newer one.
    def self.call(order)
      return order if order.provider != "stripe" || order.provider_payment_intent_id.blank?
      ProviderLease.with("payment-state-#{order.id}") do
        filter = { payment_intent: order.provider_payment_intent_id, limit: 100 }
        refunds = Stripe::Refund.list(filter).auto_paging_each.to_a
        dispute = Stripe::Dispute.list(filter).auto_paging_each.max_by { |item| item[:created].to_i }
        ApplyRefund.call(order, refunded_cents: refunds.select { |refund| COUNTED_REFUNDS.include?(refund[:status]) }.sum { |refund| refund[:amount] },
          failed_refund_ids: refunds.select { |refund| FAILED_REFUNDS.include?(refund[:status]) }.map { |refund| refund[:id] })
        complete_requests(order, refunds)
        apply_dispute(order, dispute && dispute[:status])
      end
      order.reload
    end

    # Stripe knows about these refunds, so the admin's request is finished,
    # even if its own response never came back.
    def self.complete_requests(order, refunds)
      order.refund_requests.open.each do |request|
        refund = refunds.find { |item| item[:metadata] && item[:metadata][:refund_request_id] == request.id.to_s }
        request.update!(status: "completed", provider_refund_id: refund[:id]) if refund
      end
    end
    private_class_method :complete_requests

    # A dispute Stripe no longer returns keeps its last known status.
    def self.apply_dispute(order, status)
      return if status.blank?
      order.with_lock do
        next if order.dispute_status == status
        first_seen = order.dispute_status.nil?
        order.update!(dispute_status: status)
        Emails::Notifications.attention(order) if first_seen
      end
    end
    private_class_method :apply_dispute

    # Replays events that arrived before their payment was recorded.
    def self.resolve_events(order)
      return if order.provider_payment_intent_id.blank?
      events = PaymentEvent.unresolved.where(payment_intent_id: order.provider_payment_intent_id)
      return unless events.exists?
      call(order)
      events.update_all(processed_at: Time.current)
    end
  end
end
