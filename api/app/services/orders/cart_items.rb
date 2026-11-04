module Orders
  # The cart rules checkout and shipping quotes share.
  module CartItems
    def self.parse!(raw)
      raise ApiError.new("empty_cart", "Your cart is empty.") if raw.nil? || raw == []
      unless raw.is_a?(Array) && raw.size <= 100
        raise ApiError.new("quantity_invalid", "Provide an array of up to 100 cart items.")
      end
      quantities = Hash.new(0)
      raw.each do |item|
        unless item.is_a?(Hash) && item[:quantity].is_a?(Integer) && item[:quantity].between?(1, 10)
          raise ApiError.new("quantity_invalid", "Quantities must be whole numbers from 1 to 10.")
        end
        slug = item[:product_slug]
        raise ApiError.new("unknown_product", "This product is unavailable.") unless slug.is_a?(String) && slug.present?
        quantities[slug] += item[:quantity]
        raise ApiError.new("quantity_invalid", "A product can have at most 10 units per order.") if quantities[slug] > 10
      end
      quantities.sort.map { |slug, quantity| { product_slug: slug, quantity: quantity } }
    end
  end
end
