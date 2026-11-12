class CatalogSerializer
  def self.store
    StoreSetting.current.slice(:sales_open, :contact_email, :tagline, :secondary_tagline, :story, :mission_lines).symbolize_keys
  end

  # Public summaries only carry specs the merchant has confirmed (not listed as placeholders).
  def self.summary_specs(product)
    product.specs.slice("piece_count", "finished_size").reject { |key, _| Array(product.placeholders).include?("specs.#{key}") }
  end

  def self.product(product, detail: false)
    availability = product.availability
    limit = product.effective_limit
    images = product.gallery_images
    data = product.slice(:slug, :name, :kind, :price_cents, :currency, :summary, :signature, :preorder).symbolize_keys.merge(
      preorder_ships: product.preorder ? product.preorder_ships : nil, per_customer_limit: limit,
      specs: summary_specs(product), availability: availability, drop: product.drop && drop(product.drop), image: images.first, alt_image: images.second, box: product.box)
    if detail
      data.merge!(product.slice(:description, :specs, :includes, :art, :placeholders).symbolize_keys, images: images)
      # Checkout takes at most ten of a product per order, even when the limit is higher.
      data[:max_per_order] = availability[:purchasable] ? [ limit, 10, product.stock_quantity ].compact.min : 0
    end
    data
  end

  def self.drop(drop, with_product: false, detail: false)
    data = drop.slice(:slug, :number, :name, :per_customer_limit).symbolize_keys.merge(
      quantity: drop.public_quantity, state: drop.state, release_at: drop.public_release_at&.iso8601, closes_at: drop.closes_at&.iso8601, sold_out_at: drop.sold_out_at&.iso8601)
    if with_product
      data[:products] = drop.shown_products.map { |item| product(item, detail: detail) }
      data[:product] = data[:products].first
    end
    data
  end

  def self.order(order, summary: false)
    data = order.slice(:token, :number, :status).symbolize_keys.merge(expires_at: order.expires_at.iso8601)
    return data if summary
    local, domain = order.email.split("@", 2)
    data.merge!(email_masked: "#{local.first}•••@#{domain}",
      items: order.order_items.order(:id).map { |item| item.slice(:product_slug, :name, :quantity, :unit_price_cents, :image, :preorder_ships) },
      subtotal_cents: order.subtotal_cents, shipping_cents: order.shipping_cents, tax_cents: order.tax_cents, total_cents: order.total_cents,
      fulfillment_method: order.fulfillment_method, shipping_method: order.shipping_method&.slice("label", "estimate", "instructions"), refunded_cents: order.refunded_cents, currency: order.currency,
      created_at: order.created_at.iso8601, paid_at: order.paid_at&.iso8601)
  end
end
