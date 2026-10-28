module Payments
  class Gateway
    def self.provider
      Rails.application.config.x.payment_provider
    end

    def self.simulated?
      provider == "simulated" && (Rails.env.development? || Rails.env.test?)
    end

    def self.web_url
      Rails.application.config.x.web_origins.first
    end

    # Stripe requires a session expiry at least 30 minutes after creation. The
    # order hold starts slightly earlier, so the hold is extended to match the
    # session window and the two always expire together.
    STRIPE_MIN_EXPIRY = 30.minutes + 1.minute

    def self.create_session(order)
      if order.provider == "simulated"
        return { id: "sim_#{order.token}", url: "#{web_url}/checkout/simulated/#{order.token}", expires_at: order.expires_at }
      end
      expires_at = [ order.expires_at, STRIPE_MIN_EXPIRY.from_now ].max.change(usec: 0)
      session = Stripe::Checkout::Session.create({
        mode: "payment", customer_email: order.email, expires_at: expires_at.to_i,
        metadata: { order_token: order.token },
        success_url: "#{web_url}/orders/#{order.token}?from=checkout",
        cancel_url: "#{web_url}/checkout/cancel/#{order.token}",
        shipping_address_collection: { allowed_countries: %w[US GU PR VI AS MP] },
        line_items: order.order_items.map do |item|
          { quantity: item.quantity, price_data: { currency: order.currency.downcase,
            unit_amount: item.unit_price_cents, product_data: { name: item.name } } }
        end
      }, { idempotency_key: "tano-y-tasi-order-#{order.token}" })
      { id: session.id, url: session.url, expires_at: expires_at }
    end

    # Best effort: close an open Stripe session when the customer cancels so it
    # cannot be paid later. A late payment is still handled by Payments::Complete.
    def self.expire_session(order)
      return if order.provider != "stripe" || order.provider_session_id.blank?

      Stripe::Checkout::Session.expire(order.provider_session_id)
    rescue Stripe::StripeError => error
      Rails.logger.warn("payment_session_expire_failed order_id=#{order.id} error=#{error.class}")
    end
  end
end
