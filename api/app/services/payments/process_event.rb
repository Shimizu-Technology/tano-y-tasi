module Payments
  class ProcessEvent
    def self.call(provider:, event_id:, event_type:, order: nil, payment_intent_id: nil, shipping: {})
      PaymentEvent.transaction(requires_new: true) do
        # Unique insert is in the same transaction as its inventory transition.
        event = PaymentEvent.create!(provider: provider, event_id: event_id, event_type: event_type)
        if order
          case event_type
          when "checkout.session.completed", "checkout.session.async_payment_succeeded"
            Complete.call(order, payment_intent_id: payment_intent_id, shipping: shipping)
          when "checkout.session.expired"
            Orders::Release.call(order, status: "expired")
          when "checkout.session.async_payment_failed"
            Orders::Release.call(order, status: "canceled")
          end
        end
        event.update!(processed_at: Time.current)
      end
    rescue ActiveRecord::RecordNotUnique
      raise unless PaymentEvent.exists?(event_id: event_id)
    end
  end
end
