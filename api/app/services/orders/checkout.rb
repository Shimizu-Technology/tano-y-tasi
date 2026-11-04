require "digest"

module Orders
  class Checkout
    Result = Data.define(:order, :created)

    def self.call(payload)
      new(payload).call
    end

    def initialize(payload)
      @email = payload[:email].is_a?(String) ? payload[:email].strip.downcase : ""
      @key = payload[:idempotency_key]
      @raw_items = payload[:items]
      @shipping = payload[:shipping]
    end

    def call
      validate!
      raise ApiError.new("store_closed", "The store isn't open for orders yet. Join the list and you'll hear first.") unless StoreSetting.sales_open?
      parse_shipping!
      ReleaseExpired.call
      # What was chosen, not the token itself. A retry keeps a saved quote that has since expired.
      fingerprint = Digest::SHA256.hexdigest({ email: @email, items: @items, shipping: { quote: @quote.identity, address: @address.digest } }.to_json)
      # The lease serializes only this key, including provider setup. It holds no
      # transaction or inventory row locks during network calls.
      ProviderLease.with("checkout:#{Digest::SHA256.hexdigest(@key)}") do
        existing = Order.find_by(idempotency_key: @key)
        order = existing || reserve!(fingerprint)
        conflict! if order.request_fingerprint != fingerprint
        provision_session!(order) if order.payment_url.nil? && order.status == "pending_payment"
        if order.payment_url.nil?
          raise ApiError.new("payment_unavailable", "Payment is unavailable for this checkout. Please start a new checkout.", status: :service_unavailable, details: { retry: "new_checkout" })
        end
        Result.new(order: order.reload, created: existing.nil?)
      end
    rescue ProviderLease::Busy
      raise ApiError.new("payment_unavailable", "Payment is temporarily unavailable. Retry the same request with the same idempotency_key.", status: :service_unavailable, details: { retry: "same_key" })
    end

    private

    def validate!
      raise ApiError.new("invalid_email", "Enter a valid email address.") unless @email.length <= 254 && URI::MailTo::EMAIL_REGEXP.match?(@email)
      unless @key.is_a?(String) && @key.present? && @key.bytesize <= 200
        raise ApiError.new("malformed", "An idempotency_key is required (maximum 200 bytes).", status: :bad_request)
      end
      @items = CartItems.parse!(@raw_items)
    end

    def parse_shipping!
      unless @shipping.is_a?(Hash) && @shipping[:quote].present?
        raise ApiError.new("shipping_required", "Add a shipping address to continue. If you don't see the form, refresh the page.")
      end
      @address = Shipping::Address.parse!(@shipping[:address])
      @quote = Shipping::QuoteToken.read!(@shipping[:quote])
    end

    def reserve!(fingerprint)
      Order.transaction do
        products = Product.where(slug: @items.map { |item| item[:product_slug] }).order(:id).lock.to_a
        raise ApiError.new("unknown_product", "This product is unavailable.") if products.size != @items.size || products.any? { |product| product.status != "active" || product.images.blank? }
        products.each { |product| validate_product!(product, quantity_for(product)) }
        # Prices are read under the lock, so a quote can't outlive the prices it was made for.
        @quote.verify!(address: @address, lines: products.map { |product| Shipping::Parcel::Line.new(product: product, quantity: quantity_for(product), unit_price_cents: product.price_cents) })
        subtotal = products.sum { |product| product.price_cents * quantity_for(product) }
        provider = Payments::Gateway.provider
        expires_at = (provider == "stripe" ? Payments::Gateway::STRIPE_MIN_EXPIRY : 30.minutes).from_now.change(usec: 0)
        order = Order.create!(email: @email, idempotency_key: @key, request_fingerprint: fingerprint,
          subtotal_cents: subtotal, shipping_cents: @quote.amount_cents, total_cents: subtotal + @quote.amount_cents, currency: "USD", provider: provider, expires_at: expires_at,
          provider_session_expires_at: provider == "stripe" ? expires_at : nil, shipping: @address.to_order_shipping, shipping_method: @quote.shipping_method,
          fulfillment_method: @quote.fulfillment_method, tax_enabled: StoreSetting.current.tax_enabled)
        products.each do |product|
          quantity = quantity_for(product)
          order.order_items.create!(product: product, product_slug: product.slug, name: product.name,
            quantity: quantity, unit_price_cents: product.price_cents, image: product.images.first || {},
            preorder_ships: product.preorder ? product.preorder_ships : nil)
          Inventory.change!(product, order, -quantity, "reserve")
        end
        order
      end
    rescue ActiveRecord::RecordNotUnique
      Order.find_by!(idempotency_key: @key)
    end

    def quantity_for(product)
      @items.find { |item| item[:product_slug] == product.slug }.fetch(:quantity)
    end

    def validate_product!(product, quantity)
      drop = product.drop
      if drop && (!drop.released? || (drop.closes_at && drop.closes_at <= Time.current))
        raise ApiError.new("drop_not_live", "This drop is not open for checkout.", details: { product_slug: product.slug, release_at: drop.release_at&.iso8601 })
      end
      if CustomerLimit.exceeded?(product, @email, quantity)
        limit = product.effective_limit
        raise ApiError.new("limit_exceeded", "#{product.name} is limited to #{limit} per customer.", details: { product_slug: product.slug, limit: limit, already_purchased: CustomerLimit.quantity(product, @email) })
      end
      if product.stock_quantity.zero?
        raise ApiError.new("sold_out", "#{product.name} just sold out.", details: { product_slug: product.slug, available: 0 })
      end
      if quantity > product.stock_quantity
        raise ApiError.new("insufficient_stock", "There aren't enough pieces left for that quantity.", details: { product_slug: product.slug, available: product.stock_quantity })
      end
    end

    def provision_session!(order)
      return complete_free_order!(order) if order.total_cents.zero?
      # Also initialize pre-migration reservations once, before any provider call.
      if order.provider == "stripe" && order.provider_session_expires_at.nil?
        expires_at = Payments::Gateway::STRIPE_MIN_EXPIRY.from_now.change(usec: 0)
        order.update!(provider_session_expires_at: expires_at, expires_at: expires_at)
      end
      session = Payments::Gateway.create_session(order)
      order.update!(provider_session_id: session.fetch(:id), payment_url: session.fetch(:url), expires_at: session.fetch(:expires_at))
    rescue Stripe::InvalidRequestError, Stripe::IdempotencyError => error
      Release.call(order)
      Rails.logger.error("payment_session_failed order_id=#{order.id} error=#{error.class}")
      raise ApiError.new("payment_unavailable", "Payment is unavailable for this checkout. Please start a new checkout.", status: :service_unavailable, details: { retry: "new_checkout" })
    rescue Stripe::StripeError, IOError, Timeout::Error, SocketError => error
      Rails.logger.error("payment_session_retryable order_id=#{order.id} error=#{error.class}")
      raise ApiError.new("payment_unavailable", "Payment is temporarily unavailable. Retry the same request with the same idempotency_key.", status: :service_unavailable, details: { retry: "same_key" })
    end

    # Nothing to charge, so there's nothing for Stripe to do, and it would reject the session.
    def complete_free_order!(order)
      # Together, so a crash can't leave a paid order that a retry can't find its way back to.
      Order.transaction do
        order.update!(payment_url: "#{Payments::Gateway.web_url}/orders/#{order.token}?from=checkout", provider_session_closed_at: Time.current)
        Payments::Complete.call(order, charged_cents: 0)
      end
    end

    def conflict!
      raise ApiError.new("idempotency_conflict", "This checkout key was already used for a different cart.", status: :conflict)
    end
  end
end
