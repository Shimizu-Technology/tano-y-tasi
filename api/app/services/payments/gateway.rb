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

    def self.create_session(order)
      if order.provider == "simulated"
        return { id: "sim_#{order.token}", url: "#{web_url}/checkout/simulated/#{order.token}" }
      end
      session = Stripe::Checkout::Session.create({
        mode: "payment", customer_email: order.email, expires_at: order.expires_at.to_i,
        metadata: { order_token: order.token },
        success_url: "#{web_url}/orders/#{order.token}?from=checkout",
        cancel_url: "#{web_url}/checkout/cancel/#{order.token}",
        shipping_address_collection: { allowed_countries: %w[US GU PR VI AS MP] },
        line_items: order.order_items.map do |item|
          { quantity: item.quantity, price_data: { currency: order.currency.downcase,
            unit_amount: item.unit_price_cents, product_data: { name: item.name } } }
        end
      }, { idempotency_key: "tano-y-tasi-order-#{order.token}" })
      { id: session.id, url: session.url }
    end
  end
end
