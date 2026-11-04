module Shipping
  # Live carrier rates, normalized to the same options as FlatRates. Raises
  # EasyPostClient::Error on any failure; Shipping::Quote decides what happens next.
  class EasyPostRates
    MAX_OPTIONS = 4
    # EasyPost requires customs details for these destinations, even from the mainland.
    CUSTOMS_ZONES = %w[guam_cnmi territories military].freeze

    def self.call(address, lines, settings, client: EasyPostClient.new)
      raise EasyPostClient::Error, "The origin address is incomplete" unless settings.origin_complete?
      shipment = create_shipment(address, lines, settings, client: client)
      usable_rates(shipment, settings).first(MAX_OPTIONS).map do |rate|
        cost = cents(rate.fetch("rate"))
        { label: label(rate), amount_cents: cost + settings.handling_fee_cents, kind: "live", estimate: estimate(rate),
          carrier: rate["carrier"], service: rate["service"], provider_shipment_id: shipment.fetch("id"), provider_rate_id: rate.fetch("id"), cost_cents: cost }
      end
    rescue KeyError, ArgumentError, TypeError => error
      raise EasyPostClient::Error, "EasyPost sent an unexpected response (#{error.class})"
    end

    def self.create_shipment(address, lines, settings, client:)
      shipment = { to_address: to_address(address), from_address: from_address(settings), parcel: Parcel.for(lines, settings) }
      shipment[:customs_info] = customs_info(lines, settings) if customs?(address, settings)
      client.post("shipments", shipment: shipment)
    end

    def self.usable_rates(shipment, settings)
      allowed = settings.carriers.map(&:downcase)
      rates = Array(shipment["rates"]).select do |rate|
        rate["currency"].to_s.casecmp?("USD") && (allowed.empty? || allowed.include?(rate["carrier"].to_s.downcase))
      end
      rates.sort_by { |rate| cents(rate.fetch("rate")) }
    end

    # Goods leaving Guam need customs details as well, whatever their destination.
    def self.customs?(address, settings)
      CUSTOMS_ZONES.include?(address.zone) || CUSTOMS_ZONES.include?(Address.zone_for(settings.origin["state"]))
    end

    def self.customs_info(lines, settings)
      signer = settings.customs["signer"].presence || settings.origin["name"].presence || settings.origin["company"]
      { contents_type: "merchandise", restriction_type: "none", eel_pfc: "NOEEI 30.37(a)", non_delivery_option: "return",
        customs_certify: true, customs_signer: signer, customs_items: Parcel.customs_items(lines, settings) }
    end

    def self.to_address(address)
      { name: address.name, street1: address.line1, street2: address.line2.presence, city: address.city, state: address.state,
        zip: address.postal_code, country: "US", phone: address.phone.presence }.compact
    end

    def self.from_address(settings)
      origin = settings.origin
      { name: origin["name"].presence, company: origin["company"].presence, street1: origin["line1"], street2: origin["line2"].presence,
        city: origin["city"], state: origin["state"], zip: origin["postal_code"], country: "US", phone: origin["phone"] }.compact
    end

    def self.cents(rate)
      (BigDecimal(rate.to_s) * 100).ceil
    end

    # "GroundAdvantage" reads as "USPS Ground Advantage".
    def self.label(rate)
      service = rate["service"].to_s.gsub(/(?<=[a-z])(?=[A-Z])/, " ")
      [ rate["carrier"], service.presence ].compact.join(" ")
    end

    def self.estimate(rate)
      days = rate["delivery_days"] || rate["est_delivery_days"]
      return nil unless days.is_a?(Integer) && days.positive?
      days == 1 ? "About 1 business day after it ships" : "About #{days} business days after it ships"
    end
    private_class_method :to_address, :from_address, :estimate, :customs_info
  end
end
