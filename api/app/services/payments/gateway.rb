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

    # Persist this window before the first request; retries must send it unchanged.
    STRIPE_MIN_EXPIRY = 30.minutes + 1.minute

    def self.create_session(order)
      if order.provider == "simulated"
        return { id: "sim_#{order.token}", url: "#{web_url}/checkout/simulated/#{order.token}", expires_at: order.expires_at }
      end
      expires_at = order.provider_session_expires_at
      session = Stripe::Checkout::Session.create({
        mode: "payment", customer_email: order.email, expires_at: expires_at.to_i,
        metadata: { order_token: order.token },
        success_url: "#{web_url}/orders/#{order.token}?from=checkout",
        cancel_url: "#{web_url}/checkout/cancel/#{order.token}",
        shipping_address_collection: { allowed_countries: %w[US GU PR VI AS MP] },
        line_items: order.order_items.order(:id).map do |item|
          { quantity: item.quantity, price_data: { currency: order.currency.downcase,
            unit_amount: item.unit_price_cents, product_data: { name: item.name } } }
        end
      }, { idempotency_key: "tano-y-tasi-order-#{order.token}" })
      { id: session.id, url: session.url, expires_at: expires_at }
    end

    # The null marker persists retry work when Stripe cannot confirm closure.
    # Call outside inventory transactions and locks.
    def self.expire_session(order)
      return if order.provider != "stripe" || order.provider_session_id.blank? || order.provider_session_closed_at.present?

      begin
        session = Stripe::Checkout::Session.expire(order.provider_session_id)
      rescue Stripe::InvalidRequestError
        # Expiring an already expired/completed session is rejected. Confirm its
        # actual status rather than treating every invalid request as closed.
        session = Stripe::Checkout::Session.retrieve(order.provider_session_id)
      end
      if %w[expired complete].include?(session.status)
        order.update!(provider_session_closed_at: order.provider_session_closed_at || Time.current)
      end
    rescue Stripe::StripeError, IOError, Timeout::Error, SocketError => error
      Rails.logger.warn("payment_session_expire_failed order_id=#{order.id} error=#{error.class}")
    end
  end
end
