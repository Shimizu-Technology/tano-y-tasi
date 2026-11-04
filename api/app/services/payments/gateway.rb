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
    # Stripe's tax code for shipping.
    SHIPPING_TAX_CODE = "txcd_92010001".freeze

    def self.create_session(order)
      if order.provider == "simulated"
        return { id: "sim_#{order.token}", url: "#{web_url}/checkout/simulated/#{order.token}", expires_at: order.expires_at }
      end
      expires_at = order.provider_session_expires_at
      session = Stripe::Checkout::Session.create(session_params(order, expires_at), { idempotency_key: "tano-y-tasi-order-#{order.token}" })
      { id: session.id, url: session.url, expires_at: expires_at }
    end

    def self.session_params(order, expires_at)
      tax = StoreSetting.current.tax_enabled
      params = {
        mode: "payment", customer_email: order.email, expires_at: expires_at.to_i,
        metadata: { order_token: order.token },
        success_url: "#{web_url}/orders/#{order.token}?from=checkout",
        cancel_url: "#{web_url}/checkout/cancel/#{order.token}",
        line_items: line_items(order, tax)
      }
      params[:payment_intent_data] = { shipping: stripe_shipping(order) } if order.fulfillment_method == "ship"
      params.merge!(automatic_tax: { enabled: true }, billing_address_collection: "required") if tax
      params
    end
    private_class_method :session_params

    # Stripe rejects a zero-amount line, so free items and free shipping stay off the page.
    def self.line_items(order, tax)
      lines = order.order_items.order(:id).reject { |item| item.unit_price_cents.zero? }.map do |item|
        line(order, item.quantity, item.unit_price_cents, { name: item.name, description: item.preorder_ships&.then { |ships| "Preorder. #{ships}" } }.compact, tax)
      end
      if order.shipping_cents.positive?
        product = { name: "Shipping: #{order.shipping_method&.dig('label')}" }
        product[:tax_code] = SHIPPING_TAX_CODE if tax
        lines << line(order, 1, order.shipping_cents, product, tax)
      end
      lines
    end
    private_class_method :line_items

    # Exclusive, so tax is added on top and amount_total less tax equals the order total.
    def self.line(order, quantity, amount, product, tax)
      price = { currency: order.currency.downcase, unit_amount: amount, product_data: product }
      price[:tax_behavior] = "exclusive" if tax
      { quantity: quantity, price_data: price }
    end
    private_class_method :line

    def self.stripe_shipping(order)
      saved = order.shipping.to_h
      { name: saved["name"], phone: saved["phone"], address: saved.fetch("address", {}).compact_blank }.compact_blank
    end
    private_class_method :stripe_shipping

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
