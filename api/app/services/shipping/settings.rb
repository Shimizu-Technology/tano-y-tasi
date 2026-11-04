module Shipping
  # The merchant's shipping setup, stored as JSON on the settings row. Saved values
  # are laid over these defaults, so a new setting never needs a data migration.
  class Settings
    ZONES = Address::ZONES.keys.freeze
    DEFAULTS = {
      "mode" => "flat",
      "carriers" => [],
      "handling_fee_cents" => 0,
      "free_shipping_threshold_cents" => nil,
      # Placeholders until saved: see StoreSetting#flat_rates_saved_at.
      "flat_rates" => { "mainland" => 800, "alaska_hawaii" => 1200, "guam_cnmi" => 1200, "territories" => 1200, "military" => 1200 },
      "pickup_enabled" => false,
      "pickup_instructions" => "",
      "origin" => { "name" => "", "company" => "Tåno + Tåsi", "phone" => "", "line1" => "", "line2" => "", "city" => "", "state" => "", "postal_code" => "" },
      "parcel" => { "weight_oz" => 24, "length_in" => 12, "width_in" => 10, "height_in" => 3 },
      # EasyPost needs customs details for Guam, the territories and military addresses.
      "customs" => { "description" => "Jigsaw puzzle", "hs_tariff_number" => "950300", "origin_country" => "US", "signer" => "" }
    }.freeze
    NESTED = %w[flat_rates origin parcel customs].freeze
    MAX_CENTS = 100_000

    attr_reader :values

    def self.current
      new(StoreSetting.current.shipping_settings)
    end

    def initialize(saved)
      saved = saved.is_a?(Hash) ? saved.deep_stringify_keys : {}
      @values = DEFAULTS.merge(saved) { |key, default, value| NESTED.include?(key) && value.is_a?(Hash) ? default.merge(value) : value }
    end

    DEFAULTS.each_key do |key|
      define_method(key) { values.fetch(key) }
    end

    def live?
      mode == "easypost" && EasyPostClient.configured?
    end

    def origin_complete?
      origin.values_at("line1", "city", "state", "postal_code", "phone").all?(&:present?) && (origin["name"].present? || origin["company"].present?)
    end

    # Rejects what the merchant typed with one message per field, in the shape the admin forms show.
    def self.errors_for(patch, candidate)
      errors = {}
      errors["mode"] = [ "must be flat or easypost" ] unless %w[flat easypost].include?(candidate.mode)
      unless candidate.carriers.is_a?(Array) && candidate.carriers.all? { |carrier| carrier.is_a?(String) && carrier.strip.present? }
        errors["carriers"] = [ "must be a list of carrier names" ]
      end
      errors["handling_fee_cents"] = [ "must be a whole number of cents from 0" ] unless cents?(candidate.handling_fee_cents)
      unless candidate.free_shipping_threshold_cents.nil? || cents?(candidate.free_shipping_threshold_cents)
        errors["free_shipping_threshold_cents"] = [ "must be a whole number of cents from 0, or empty" ]
      end
      ZONES.each { |zone| errors["flat_rates.#{zone}"] = [ "must be a whole number of cents from 0" ] unless cents?(candidate.flat_rates[zone]) }
      errors["pickup_enabled"] = [ "must be true or false" ] unless [ true, false ].include?(candidate.pickup_enabled)
      errors["pickup_instructions"] = [ "must say where and when to pick up" ] if candidate.pickup_enabled == true && candidate.pickup_instructions.to_s.strip.empty?
      errors["pickup_instructions"] = [ "is too long" ] if candidate.pickup_instructions.to_s.length > 500
      candidate.parcel.each { |key, value| errors["parcel.#{key}"] = [ "must be above 0" ] unless value.is_a?(Numeric) && value.positive? && value < 10_000 }
      state = candidate.origin["state"].to_s
      errors["origin.state"] = [ "must be a U.S. state or territory" ] if state.present? && !Address::STATES.include?(state)
      zip = candidate.origin["postal_code"].to_s
      errors["origin.postal_code"] = [ "must be a 5-digit ZIP code" ] if zip.present? && !Address::ZIP_FORMAT.match?(zip)
      hs = candidate.customs["hs_tariff_number"].to_s
      errors["customs.hs_tariff_number"] = [ "must be 6 to 10 digits" ] unless hs.delete(".").match?(/\A\d{6,10}\z/)
      errors["customs.origin_country"] = [ "must be a two-letter country code" ] unless candidate.customs["origin_country"].to_s.match?(/\A[A-Z]{2}\z/)
      errors["customs.description"] = [ "can't be blank" ] if candidate.customs["description"].to_s.strip.empty?
      errors.slice(*errors.keys.select { |key| relevant?(key, patch) })
    end

    def self.cents?(value)
      value.is_a?(Integer) && value.between?(0, MAX_CENTS)
    end
    private_class_method :cents?

    # Saved values can't block a save of something else. The pickup pair is one choice.
    def self.relevant?(key, patch)
      patch.key?(key.split(".").first) || (key == "pickup_instructions" && patch.key?("pickup_enabled"))
    end
    private_class_method :relevant?
  end
end
