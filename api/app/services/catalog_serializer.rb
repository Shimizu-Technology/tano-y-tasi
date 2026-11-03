class CatalogSerializer
  # Public summaries only carry specs the merchant has confirmed (not listed as placeholders).
  def self.summary_specs(product)
    product.specs.slice("piece_count", "finished_size").reject { |key, _| Array(product.placeholders).include?("specs.#{key}") }
  end

  def self.product(product, detail: false)
    availability = product.availability
    data = product.slice(:slug, :name, :kind, :price_cents, :currency, :summary).symbolize_keys.merge(
      specs: summary_specs(product), availability: availability, drop: product.drop && drop(product.drop), image: product.images.first, alt_image: product.images.second)
    if detail
      data.merge!(product.slice(:description, :specs, :includes, :art, :images, :placeholders).symbolize_keys)
      limit = product.drop&.per_customer_limit
      data.merge!(per_customer_limit: limit, max_per_order: availability[:purchasable] ? [ limit || 10, product.stock_quantity ].min : 0)
    end
    data
  end

  def self.drop(drop, with_product: false, detail: false)
    data = drop.slice(:slug, :number, :name, :per_customer_limit).symbolize_keys.merge(
      quantity: drop.public_quantity, state: drop.state, release_at: drop.release_at&.iso8601, closes_at: drop.closes_at&.iso8601, sold_out_at: drop.sold_out_at&.iso8601)
    data[:product] = product(drop.product, detail: detail) if with_product
    data
  end

  def self.order(order, summary: false)
    data = order.slice(:token, :number, :status).symbolize_keys.merge(expires_at: order.expires_at.iso8601)
    return data if summary
    local, domain = order.email.split("@", 2)
    data.merge!(email_masked: "#{local.first}•••@#{domain}",
      items: order.order_items.order(:id).map { |item| item.slice(:product_slug, :name, :quantity, :unit_price_cents, :image) },
      subtotal_cents: order.subtotal_cents, total_cents: order.total_cents, currency: order.currency,
      created_at: order.created_at.iso8601, paid_at: order.paid_at&.iso8601)
  end
end
