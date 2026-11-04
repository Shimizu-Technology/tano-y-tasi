module Api
  module V1
    class WebhooksController < ApplicationController
      SESSION_EVENTS = (Payments::ProcessEvent::PAID_EVENTS + %w[checkout.session.expired checkout.session.async_payment_failed]).freeze
      # These can arrive out of order, so they trigger a read of the current state.
      STATE_EVENTS = %w[charge.refunded refund.created refund.updated refund.failed
        charge.dispute.created charge.dispute.updated charge.dispute.closed].freeze

      def stripe
        secret = ENV["STRIPE_WEBHOOK_SECRET"]
        return render_error("malformed", "Stripe webhooks are not configured.", :bad_request) if secret.blank?
        event = Stripe::Webhook.construct_event(request.raw_post, request.headers["Stripe-Signature"], secret)
        object = event.data.object
        details = if SESSION_EVENTS.include?(event.type)
          session_details(event, object)
        elsif STATE_EVENTS.include?(event.type)
          state_details(object)
        else
          {}
        end
        Payments::ProcessEvent.call(provider: "stripe", event_id: event.id, event_type: event.type, **details)
        resolve_earlier_events(details) if Payments::ProcessEvent::PAID_EVENTS.include?(event.type)
        render json: { received: true }
      rescue Stripe::SignatureVerificationError, JSON::ParserError
        render_error("malformed", "Invalid Stripe webhook signature or payload.", :bad_request)
      rescue *Payments::SyncProviderState::RETRYABLE => error
        # Nothing was recorded, so Stripe's retry runs this again.
        Rails.logger.error("STRIPE_EVENT_RETRY error=#{error.class}")
        render_error("payment_unavailable", "Stripe is temporarily unavailable.", :service_unavailable)
      end

      def easypost
        secret = ENV["EASYPOST_WEBHOOK_SECRET"]
        return render_error("malformed", "EasyPost webhooks are not configured.", :bad_request) if secret.blank?
        unless easypost_signature_valid?(secret)
          return render_error("malformed", "Invalid EasyPost webhook signature.", :bad_request)
        end
        event = JSON.parse(request.raw_post)
        if event.is_a?(Hash) && event["description"] == "tracker.updated" && event["id"].present?
          Shipping::RecordTrackerEvent.call(event)
        end
        render json: { received: true }
      rescue JSON::ParserError
        render_error("malformed", "Invalid EasyPost webhook payload.", :bad_request)
      end

      private

      # EasyPost signs the raw body with HMAC-SHA256, using the NFKD form of the secret.
      def easypost_signature_valid?(secret)
        digest = OpenSSL::HMAC.hexdigest("SHA256", secret.unicode_normalize(:nfkd), request.raw_post)
        ActiveSupport::SecurityUtils.secure_compare("hmac-sha256-hex=#{digest}", request.headers["X-Hmac-Signature"].to_s)
      end

      # Acknowledge signed events unless a retry could help. A payment that doesn't
      # match can't be fixed by a retry, so it's recorded for review instead.
      def session_details(event, session)
        token = session[:metadata] && session[:metadata][:order_token]
        order = Order.find_by(token: token, provider: "stripe") if token.present?
        unless order
          Rails.logger.warn("STRIPE_EVENT_IGNORED event_id=#{event.id} reason=unknown_session")
          return {}
        end
        same_session = order.provider_session_id.nil? || order.provider_session_id == session[:id]
        unless Payments::ProcessEvent::PAID_EVENTS.include?(event.type)
          return same_session ? { order: order } : {}
        end
        if session[:payment_status] != "paid"
          order.update!(provider_session_closed_at: order.provider_session_closed_at || Time.current)
          return {}
        end
        shipping = session[:collected_information] && session[:collected_information][:shipping_details]
        shipping ||= session[:shipping_details]
        # Tax is Stripe's to work out, so it's the one part of the charge the order can't predict.
        tax = session[:total_details] && session[:total_details][:amount_tax]
        tax = tax.to_i
        problem = if !same_session
          "session_mismatch"
        elsif session[:amount_total].to_i - tax != order.total_cents || session[:currency] != order.currency.downcase
          "amount_mismatch"
        end
        { order: order, payment_intent_id: session[:payment_intent], shipping: shipping&.to_h || {}, problem: problem, charged_cents: session[:amount_total], tax_cents: tax }
      end

      def state_details(object)
        payment_intent_id = object[:payment_intent]
        return {} if payment_intent_id.blank?
        order = Order.find_by(provider_payment_intent_id: payment_intent_id)
        return { payment_intent_id: payment_intent_id, unresolved: true } unless order
        Payments::SyncProviderState.call(order)
        { payment_intent_id: payment_intent_id }
      end

      # The payment is safely recorded, so a failure here is left for hourly maintenance.
      def resolve_earlier_events(details)
        Payments::SyncProviderState.resolve_events(details[:order].reload) if details[:order]
      rescue *Payments::SyncProviderState::RETRYABLE => error
        Rails.logger.warn("STRIPE_EVENT_DEFERRED error=#{error.class}")
      end
    end
  end
end
