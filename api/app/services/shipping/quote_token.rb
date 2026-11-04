module Shipping
  # A shipping option the server priced, signed so the client can carry it to checkout
  # without being able to change it. Bound to the address and to the cart at its prices.
  class QuoteToken
    TTL = 30.minutes
    # What identifies the choice itself, so a re-quote of the same option is the same request.
    IDENTITY = %w[amount_cents label carrier service kind provider_rate_id address_digest items_digest].freeze

    attr_reader :values

    def self.issue(option, address:, lines:)
      values = option.deep_stringify_keys.merge("address_digest" => address.digest, "items_digest" => items_digest(lines), "expires_at" => TTL.from_now.to_i)
      verifier.generate(values, purpose: :shipping_quote)
    end

    # Checks the signature only. Expiry and digests matter only when reserving a new order,
    # so a retry of a checkout that already holds stock survives its quote's expiry.
    def self.read!(token)
      values = token.is_a?(String) ? verifier.verified(token, purpose: :shipping_quote) : nil
      raise invalid unless values.is_a?(Hash)
      new(values)
    end

    def self.items_digest(lines)
      Digest::SHA256.hexdigest(lines.map { |line| [ line.product.slug, line.quantity, line.unit_price_cents ] }.sort.to_json)
    end

    def self.invalid
      ApiError.new("shipping_quote_invalid", "Your shipping options need refreshing. Choose one again to continue.")
    end

    def self.verifier
      Rails.application.message_verifier("shipping-quote")
    end
    private_class_method :verifier

    def initialize(values)
      @values = values
    end

    def identity
      values.slice(*IDENTITY)
    end

    def verify!(address:, lines:)
      raise self.class.invalid unless values["address_digest"] == address.digest && values["items_digest"] == self.class.items_digest(lines)
      return if values["expires_at"].to_i > Time.current.to_i
      raise ApiError.new("shipping_quote_expired", "Your shipping options expired. Choose one again to continue.")
    end

    def amount_cents
      values.fetch("amount_cents")
    end

    def fulfillment_method
      values["kind"] == "pickup" ? "pickup" : "ship"
    end

    # Saved on the order. Provider ids and the carrier's cost are for the admin only.
    def shipping_method
      values.except("amount_cents", "address_digest", "items_digest", "expires_at")
    end
  end
end
