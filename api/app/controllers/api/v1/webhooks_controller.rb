module Api
  module V1
    class WebhooksController < ApplicationController
      SESSION_EVENTS = (Payments::ProcessEvent::PAID_EVENTS + %w[checkout.session.expired checkout.session.async_payment_failed]).freeze
      DISPUTE_EVENTS = %w[charge.dispute.created charge.dispute.updated charge.dispute.closed].freeze

      def stripe
        secret = ENV["STRIPE_WEBHOOK_SECRET"]
        return render_error("malformed", "Stripe webhooks are not configured.", :bad_request) if secret.blank?
        event = Stripe::Webhook.construct_event(request.raw_post, request.headers["Stripe-Signature"], secret)
        object = event.data.object
        details = if SESSION_EVENTS.include?(event.type)
          session_details(event, object)
        elsif event.type == "charge.refunded"
          { order: order_for_intent(object.payment_intent), refunded_cents: object.amount_refunded }
        elsif DISPUTE_EVENTS.include?(event.type)
          { order: order_for_intent(object.payment_intent), dispute_status: object.status }
        else
          {}
        end
        Payments::ProcessEvent.call(provider: "stripe", event_id: event.id, event_type: event.type, **details)
        render json: { received: true }
      rescue Stripe::SignatureVerificationError, JSON::ParserError
        render_error("malformed", "Invalid Stripe webhook signature or payload.", :bad_request)
      end

      private

      # Always acknowledge a signed event. Stripe disables endpoints that keep failing,
      # and a retry can't fix a payment that doesn't match: it is recorded for review.
      def session_details(event, session)
        order = Order.find_by(token: session[:metadata]&.[](:order_token), provider: "stripe")
        unless order
          Rails.logger.warn("STRIPE_EVENT_IGNORED event_id=#{event.id} reason=unknown_session")
          return {}
        end
        same_session = order.provider_session_id.nil? || order.provider_session_id == session.id
        unless Payments::ProcessEvent::PAID_EVENTS.include?(event.type)
          return same_session ? { order: order } : {}
        end
        if session.payment_status != "paid"
          order.update!(provider_session_closed_at: order.provider_session_closed_at || Time.current)
          return {}
        end
        shipping = session.respond_to?(:collected_information) ? session.collected_information&.shipping_details : nil
        shipping ||= session.respond_to?(:shipping_details) ? session.shipping_details : nil
        problem = if !same_session
          "session_mismatch"
        elsif session.amount_total != order.total_cents || session.currency != order.currency.downcase
          "amount_mismatch"
        end
        { order: order, payment_intent_id: session.payment_intent, shipping: shipping&.to_h || {}, problem: problem }
      end

      def order_for_intent(payment_intent_id)
        Order.find_by(provider_payment_intent_id: payment_intent_id) if payment_intent_id.present?
      end
    end
  end
end
