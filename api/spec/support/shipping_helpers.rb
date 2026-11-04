# A real, signed shipping choice for specs. The default costs nothing, so specs that
# aren't about shipping keep an order total that equals their subtotal.
module ShippingHelpers
  GUAM_ADDRESS = { name: "A Buyer", line1: "123 Marine Corps Drive", line2: "", city: "Hagåtña", state: "GU", postal_code: "96910", phone: "671-555-0100" }.freeze

  def shipping_for(items, address: GUAM_ADDRESS, amount_cents: 0, kind: "flat", label: "Standard", **extra)
    parsed = Shipping::Address.new(address)
    { quote: Shipping::QuoteToken.issue({ amount_cents: amount_cents, kind: kind, label: label, estimate: nil, **extra }, address: parsed, lines: quote_lines(items)), address: address }
  end

  def quote_lines(items)
    Array(items).select { |item| item.is_a?(Hash) && item[:quantity].is_a?(Integer) }.group_by { |item| item[:product_slug] }.filter_map do |slug, rows|
      product = Product.find_by(slug: slug)
      product && Shipping::Parcel::Line.new(product: product, quantity: rows.sum { |row| row[:quantity] }, unit_price_cents: product.price_cents)
    end
  end

  def with_shipping(payload)
    payload[:shipping] ? payload : payload.merge(shipping: shipping_for(payload[:items]))
  end

  def checkout_call(payload)
    Orders::Checkout.call(with_shipping(payload))
  end
end
