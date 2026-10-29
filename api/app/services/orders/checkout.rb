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
    end

    def call
      validate!
      ReleaseExpired.call
      fingerprint = Digest::SHA256.hexdigest({ email: @email, items: @items }.to_json)
      # Session advisory lock serializes only this key, including provider setup.
      # It holds no transaction or inventory row locks during network calls.
      Order.connection_pool.with_connection do |connection|
        lock_name = connection.quote("checkout:#{@key}")
        connection.execute("SELECT pg_advisory_lock(hashtextextended(#{lock_name}, 0))")
        begin
          existing = Order.find_by(idempotency_key: @key)
          order = existing || reserve!(fingerprint)
          conflict! if order.request_fingerprint != fingerprint
          provision_session!(order) if order.payment_url.nil? && order.status == "pending_payment"
          if order.payment_url.nil?
            raise ApiError.new("payment_unavailable", "Payment is unavailable for this checkout. Please start a new checkout.", status: :service_unavailable, details: { retry: "new_checkout" })
          end
          Result.new(order: order.reload, created: existing.nil?)
        ensure
          connection.execute("SELECT pg_advisory_unlock(hashtextextended(#{lock_name}, 0))")
        end
      end
    end

    private

    def validate!
      raise ApiError.new("invalid_email", "Enter a valid email address.") unless @email.length <= 254 && URI::MailTo::EMAIL_REGEXP.match?(@email)
      unless @key.is_a?(String) && @key.present? && @key.bytesize <= 200
        raise ApiError.new("malformed", "An idempotency_key is required (maximum 200 bytes).", status: :bad_request)
      end
      raise ApiError.new("empty_cart", "Your cart is empty.") if @raw_items.nil? || @raw_items == []
      unless @raw_items.is_a?(Array) && @raw_items.size <= 100
        raise ApiError.new("quantity_invalid", "Provide an array of up to 100 cart items.")
      end
      quantities = Hash.new(0)
      @raw_items.each do |item|
        unless item.is_a?(Hash) && item[:quantity].is_a?(Integer) && item[:quantity].between?(1, 10)
          raise ApiError.new("quantity_invalid", "Quantities must be whole numbers from 1 to 10.")
        end
        slug = item[:product_slug]
        raise ApiError.new("unknown_product", "This product is unavailable.") unless slug.is_a?(String) && slug.present?
        quantities[slug] += item[:quantity]
        raise ApiError.new("quantity_invalid", "A product can have at most 10 units per order.") if quantities[slug] > 10
      end
      @items = quantities.sort.map { |slug, quantity| { product_slug: slug, quantity: quantity } }
    end

    def reserve!(fingerprint)
      Order.transaction do
        products = Product.where(slug: @items.map { |item| item[:product_slug] }).order(:id).lock.to_a
        raise ApiError.new("unknown_product", "This product is unavailable.") if products.size != @items.size || products.any? { |product| product.status != "active" }
        products.each { |product| validate_product!(product, quantity_for(product)) }
        subtotal = products.sum { |product| product.price_cents * quantity_for(product) }
        provider = Payments::Gateway.provider
        expires_at = (provider == "stripe" ? Payments::Gateway::STRIPE_MIN_EXPIRY : 30.minutes).from_now.change(usec: 0)
        order = Order.create!(email: @email, idempotency_key: @key, request_fingerprint: fingerprint,
          subtotal_cents: subtotal, total_cents: subtotal, currency: "USD", provider: provider, expires_at: expires_at,
          provider_session_expires_at: provider == "stripe" ? expires_at : nil)
        products.each do |product|
          quantity = quantity_for(product)
          order.order_items.create!(product: product, product_slug: product.slug, name: product.name,
            quantity: quantity, unit_price_cents: product.price_cents, image: product.images.first || {})
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
      if drop && (drop.release_at > Time.current || (drop.closes_at && drop.closes_at <= Time.current))
        raise ApiError.new("drop_not_live", "This drop is not open for checkout.", details: { product_slug: product.slug, release_at: drop.release_at.iso8601 })
      end
      if drop
        already = CustomerLimit.quantity(product, @email)
        if already + quantity > drop.per_customer_limit
          raise ApiError.new("limit_exceeded", "This drop is limited to #{drop.per_customer_limit} per customer.", details: { product_slug: product.slug, limit: drop.per_customer_limit, already_purchased: already })
        end
      end
      if product.stock_quantity.zero?
        raise ApiError.new("sold_out", "#{product.name} just sold out.", details: { product_slug: product.slug, available: 0 })
      end
      if quantity > product.stock_quantity
        raise ApiError.new("insufficient_stock", "There aren't enough pieces left for that quantity.", details: { product_slug: product.slug, available: product.stock_quantity })
      end
    end

    def provision_session!(order)
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

    def conflict!
      raise ApiError.new("idempotency_conflict", "This checkout key was already used for a different cart.", status: :conflict)
    end
  end
end
