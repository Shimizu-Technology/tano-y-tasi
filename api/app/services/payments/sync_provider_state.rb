module Payments
  # Reads refunds and disputes straight from Stripe. Events can arrive late, repeat
  # or carry stale snapshots; the current state cannot. Call outside locks.
  class SyncProviderState
    COUNTED_REFUNDS = %w[pending requires_action succeeded].freeze

    def self.call(order)
      return order if order.provider != "stripe" || order.provider_payment_intent_id.blank?
      filter = { payment_intent: order.provider_payment_intent_id, limit: 100 }
      refunded = Stripe::Refund.list(filter).auto_paging_each.select { |refund| COUNTED_REFUNDS.include?(refund[:status]) }.sum { |refund| refund[:amount] }
      dispute = Stripe::Dispute.list(filter).auto_paging_each.max_by { |item| item[:created].to_i }
      ApplyRefund.call(order, refunded_cents: refunded)
      apply_dispute(order, dispute && dispute[:status])
      order.reload
    end

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
