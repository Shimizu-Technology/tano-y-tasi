module Shipping
  # A customer's ship-to address, normalized so a quote can be bound to it.
  class Address
    ZONES = {
      "mainland" => %w[AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY],
      "alaska_hawaii" => %w[AK HI],
      "guam_cnmi" => %w[GU MP],
      "territories" => %w[PR VI AS],
      "military" => %w[AA AE AP]
    }.freeze
    STATES = ZONES.values.flatten.freeze
    ZIP_FORMAT = /\A\d{5}(-\d{4})?\z/
    # Only where the rule is simple. A wrong ZIP elsewhere is the carrier's to catch.
    ZIP_PREFIXES = {
      "GU" => [ /\A969[123]\d/, "Guam ZIP codes run from 96910 to 96932" ],
      "MP" => [ /\A9695[012]/, "Northern Mariana Islands ZIP codes are 96950, 96951 or 96952" ],
      "PR" => [ /\A00[679]/, "Puerto Rico ZIP codes start with 006, 007 or 009" ],
      "VI" => [ /\A008/, "U.S. Virgin Islands ZIP codes start with 008" ],
      "AS" => [ /\A96799/, "The American Samoa ZIP code is 96799" ],
      "HI" => [ /\A96[78]/, "Hawaii ZIP codes start with 967 or 968" ],
      "AK" => [ /\A99[5-9]/, "Alaska ZIP codes start with 995 to 999" ],
      "AA" => [ /\A340/, "AA military ZIP codes start with 340" ],
      "AE" => [ /\A09/, "AE military ZIP codes start with 09" ],
      "AP" => [ /\A96[2-6]/, "AP military ZIP codes start with 962 to 966" ]
    }.freeze
    LIMITS = { name: 100, line1: 100, line2: 100, city: 60, phone: 30 }.freeze

    attr_reader :name, :line1, :line2, :city, :state, :postal_code, :phone

    def self.parse!(raw)
      address = new(raw)
      errors = address.errors
      return address if errors.empty?
      raise ApiError.new("invalid_address", "Check your shipping address.", details: { fields: errors })
    end

    def initialize(raw)
      raw = raw.is_a?(Hash) ? raw.with_indifferent_access : {}
      @name = text(raw[:name])
      @line1 = text(raw[:line1])
      @line2 = text(raw[:line2])
      @city = text(raw[:city])
      @state = text(raw[:state]).upcase
      @postal_code = text(raw[:postal_code])
      @phone = text(raw[:phone])
      @country = text(raw[:country]).upcase
    end

    def errors
      errors = {}
      errors[:name] = "Enter the name of the person receiving this." if name.empty?
      errors[:line1] = "Enter a street address or PO box." if line1.empty?
      errors[:city] = "Enter a city." if city.empty?
      LIMITS.each { |field, limit| errors[field] = "That's too long." if public_send(field).length > limit }
      errors[:country] = "We only ship within the U.S. and its territories for now." unless [ "", "US" ].include?(@country)
      if !STATES.include?(state)
        errors[:state] = "Choose a state or territory."
      elsif zone == "military" && !%w[APO FPO DPO].include?(city.upcase)
        errors[:city] = "For a military address, the city is APO, FPO or DPO."
      end
      if !ZIP_FORMAT.match?(postal_code)
        errors[:postal_code] = "Enter a 5-digit ZIP code."
      elsif (rule = ZIP_PREFIXES[state]) && !rule.first.match?(postal_code)
        errors[:postal_code] = "#{rule.last}."
      end
      errors
    end

    def self.zone_for(state)
      ZONES.find { |_zone, states| states.include?(state) }&.first
    end

    def zone
      self.class.zone_for(state)
    end

    # The existing orders.shipping shape, which the admin already reads.
    def to_order_shipping
      { name: name, phone: phone.presence, address: { line1: line1, line2: line2.presence, city: city, state: state, postal_code: postal_code, country: "US" } }
    end

    def digest
      Digest::SHA256.hexdigest([ name, line1, line2, city, state, postal_code, phone ].map(&:downcase).to_json)
    end

    private

    def text(value)
      value.is_a?(String) ? value.squish : ""
    end
  end
end
