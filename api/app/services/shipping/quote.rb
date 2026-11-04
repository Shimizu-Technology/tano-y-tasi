module Shipping
  # Turns a cart and an address into the options a customer can choose from. Checkout
  # never dies on a carrier: any EasyPost failure or empty answer falls back to flat rates.
  class Quote
    def self.call(address:, lines:, settings: Settings.current)
      options = provider_options(address, lines, settings)
      options = apply_free_shipping(options, lines, settings)
      options << pickup_option(settings) if settings.pickup_enabled && address.state == "GU"
      options.map { |option| public_option(option, address, lines) }
    end

    def self.provider_options(address, lines, settings)
      return FlatRates.call(address, settings) unless settings.live?
      options = EasyPostRates.call(address, lines, settings)
      return options if options.any?
      fall_back("no_rates", address, settings)
    rescue StandardError => error
      fall_back(error.class.name, address, settings)
    end

    # Never logs the address: only that it happened and to which zone.
    def self.fall_back(reason, address, settings)
      Rails.logger.error("EASYPOST_RATES_FALLBACK reason=#{reason} zone=#{address.zone}")
      FlatRates.call(address, settings, kind: "flat_fallback")
    end

    # Over the threshold, the cheapest way to ship it is free.
    def self.apply_free_shipping(options, lines, settings)
      threshold = settings.free_shipping_threshold_cents
      return options if threshold.nil? || lines.sum { |line| line.unit_price_cents * line.quantity } < threshold
      options.map.with_index { |option, index| index.zero? ? option.merge(amount_cents: 0) : option }
    end

    def self.pickup_option(settings)
      { label: "Pick up in Guam", amount_cents: 0, kind: "pickup", estimate: nil, instructions: settings.pickup_instructions }
    end

    def self.public_option(option, address, lines)
      { quote: QuoteToken.issue(option, address: address, lines: lines), label: option[:label], amount_cents: option[:amount_cents],
        estimate: option[:estimate], kind: option[:kind], instructions: option[:instructions] }
    end
    private_class_method :provider_options, :fall_back, :apply_free_shipping, :pickup_option, :public_option
  end
end
