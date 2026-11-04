module Shipping
  # What the merchant charges per zone. Never touches the network, so it's always there.
  class FlatRates
    def self.call(address, settings, kind: "flat")
      [ { label: "Standard", amount_cents: settings.flat_rates.fetch(address.zone), kind: kind, estimate: nil } ]
    end
  end
end
