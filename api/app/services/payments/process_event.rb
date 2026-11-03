module Payments
  class ProcessEvent
    PAID_EVENTS = %w[checkout.session.completed checkout.session.async_payment_succeeded].freeze

    def self.call(provider:, event_id:, event_type:, order: nil, payment_intent_id: nil, shipping: {}, problem: nil, refunded_cents: nil, dispute_status: nil)
      PaymentEvent.transaction(requires_new: true) do
        # Unique insert is in the same transaction as its inventory transition.
        event = PaymentEvent.create!(provider: provider, event_id: event_id, event_type: event_type)
        if order
          case event_type
          when *PAID_EVENTS
            Complete.call(order, payment_intent_id: payment_intent_id, shipping: shipping, problem: problem)
          when "checkout.session.expired"
            Orders::Release.call(order, status: "expired")
          when "checkout.session.async_payment_failed"
            Orders::Release.call(order, status: "canceled")
          when "charge.refunded"
            ApplyRefund.call(order, refunded_cents: refunded_cents)
          when "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"
            order.update!(dispute_status: dispute_status)
            Emails::Notifications.attention(order) if event_type == "charge.dispute.created"
          end
          if provider == "stripe" && (PAID_EVENTS + [ "checkout.session.expired" ]).include?(event_type)
            order.update!(provider_session_closed_at: order.provider_session_closed_at || Time.current)
          end
        end
        event.update!(processed_at: Time.current)
      end
      if order && event_type == "checkout.session.async_payment_failed" && %w[canceled expired].include?(order.status)
        Gateway.expire_session(order)
      end
    rescue ActiveRecord::RecordNotUnique
      raise unless PaymentEvent.exists?(event_id: event_id)
    end
  end
end
