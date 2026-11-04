module Shipping
  # One box for the whole order. Weights add up. Puzzle boxes stack flat, so the parcel
  # takes the largest length and width and the heights add up. A product with no
  # measurement of its own uses the default parcel's. It's a rating estimate, so the
  # merchant should set real weights on products before relying on live rates.
  class Parcel
    Line = Data.define(:product, :quantity, :unit_price_cents)

    def self.for(lines, settings)
      default = settings.parcel
      measure = ->(line, field) { (line.product.public_send(field) || default.fetch(field)).to_f }
      {
        weight: lines.sum { |line| measure.call(line, "weight_oz") * line.quantity }.round(1),
        length: lines.map { |line| measure.call(line, "length_in") }.max,
        width: lines.map { |line| measure.call(line, "width_in") }.max,
        height: lines.sum { |line| measure.call(line, "height_in") * line.quantity }.round(1)
      }
    end

    # EasyPost's value and weight are for the whole line, not one unit.
    def self.customs_items(lines, settings)
      lines.map do |line|
        weight = (line.product.weight_oz || settings.parcel.fetch("weight_oz")).to_f * line.quantity
        { description: settings.customs.fetch("description"), quantity: line.quantity, weight: weight.round(1),
          value: (line.unit_price_cents * line.quantity / 100.0).round(2), hs_tariff_number: settings.customs.fetch("hs_tariff_number"),
          origin_country: settings.customs.fetch("origin_country"), currency: "USD" }
      end
    end
  end
end
