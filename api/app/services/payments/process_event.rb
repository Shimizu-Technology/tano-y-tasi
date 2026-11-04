module Payments
  class ProcessEvent
    PAID_EVENTS = %w[checkout.session.completed checkout.session.async_payment_succeeded].freeze

    def self.call(provider:, event_id:, event_type:, order: nil, payment_intent_id: nil, shipping: {}, problem: nil, charged_cents: nil, tax_cents: nil, unresolved: false)
      PaymentEvent.transaction(requires_new: true) do
        # Unique insert is in the same transaction as its inventory transition.
        event = PaymentEvent.create!(provider: provider, event_id: event_id, event_type: event_type, payment_intent_id: payment_intent_id)
        if order
          case event_type
          when *PAID_EVENTS
            Complete.call(order, payment_intent_id: payment_intent_id, shipping: shipping, problem: problem, charged_cents: charged_cents, tax_cents: tax_cents)
          when "checkout.session.expired"
            Orders::Release.call(order, status: "expired")
          when "checkout.session.async_payment_failed"
            Orders::Release.call(order, status: "canceled")
          end
          if provider == "stripe" && (PAID_EVENTS + [ "checkout.session.expired" ]).include?(event_type)
            order.update!(provider_session_closed_at: order.provider_session_closed_at || Time.current)
          end
        end
        event.update!(processed_at: Time.current) unless unresolved
      end
      if order && event_type == "checkout.session.async_payment_failed" && %w[canceled expired].include?(order.status)
        Gateway.expire_session(order)
      end
    rescue ActiveRecord::RecordNotUnique
      raise unless PaymentEvent.exists?(event_id: event_id)
    end
  end
end
