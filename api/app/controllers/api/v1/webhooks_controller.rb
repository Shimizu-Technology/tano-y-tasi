module Api
  module V1
    class WebhooksController < ApplicationController
      def stripe
        secret = ENV["STRIPE_WEBHOOK_SECRET"]
        return render_error("malformed", "Stripe webhooks are not configured.", :bad_request) if secret.blank?
        event = Stripe::Webhook.construct_event(request.raw_post, request.headers["Stripe-Signature"], secret)
        session = event.data.object
        handled = %w[checkout.session.completed checkout.session.async_payment_succeeded checkout.session.expired checkout.session.async_payment_failed].include?(event.type)
        order = nil
        if handled
          order = Order.find_by!(token: session[:metadata]&.[](:order_token), provider: "stripe")
          if order.provider_session_id && order.provider_session_id != session.id
            return render_error("malformed", "Payment session does not match the order.", :bad_request)
          end
          if %w[checkout.session.completed checkout.session.async_payment_succeeded].include?(event.type)
            unless session.payment_status == "paid"
              order.update!(provider_session_closed_at: order.provider_session_closed_at || Time.current)
              return render json: { received: true }
            end
            unless session.amount_total == order.total_cents && session.currency == order.currency.downcase
              return render_error("malformed", "Payment amount does not match the order.", :bad_request)
            end
          end
        end
        shipping = session.respond_to?(:collected_information) ? session.collected_information&.shipping_details : nil
        shipping ||= session.respond_to?(:shipping_details) ? session.shipping_details : nil
        Payments::ProcessEvent.call(provider: "stripe", event_id: event.id, event_type: event.type, order: order,
          payment_intent_id: session.respond_to?(:payment_intent) ? session.payment_intent : nil, shipping: shipping&.to_h || {})
        render json: { received: true }
      rescue Stripe::SignatureVerificationError, JSON::ParserError
        render_error("malformed", "Invalid Stripe webhook signature or payload.", :bad_request)
      end
    end
  end
end
