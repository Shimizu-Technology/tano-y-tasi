class AdminSerializer
  def self.store
    CatalogSerializer.store.merge(payment_mode: payment_mode, shipping_placeholders: StoreSetting.current.flat_rates_saved_at.nil?)
  end

  def self.shipping
    store = StoreSetting.current
    settings = Shipping::Settings.new(store.shipping_settings)
    settings.values.merge("tax_enabled" => store.tax_enabled, "flat_rates_placeholder" => store.flat_rates_saved_at.nil?,
      "easypost_configured" => Shipping::EasyPostClient.configured?, "easypost_webhook_configured" => ENV["EASYPOST_WEBHOOK_SECRET"].present?,
      "origin_complete" => settings.origin_complete?)
  end

  def self.payment_mode
    return "simulated" unless Payments::Gateway.provider == "stripe"
    Stripe.api_key.to_s.start_with?("sk_live_") ? "stripe_live" : "stripe_test"
  end

  def self.page(page)
    page.slice(:slug, :title, :body, :updated_at)
  end

  def self.user(user)
    user.slice(:id, :email, :name, :role, :active, :last_signed_in_at)
  end

  def self.invitation(invitation)
    invitation.slice(:id, :email, :created_at, :accepted_at, :revoked_at)
  end

  def self.delivery(delivery)
    delivery.slice(:id, :kind, :to, :subject, :status, :attempts, :last_error, :sent_at)
  end

  def self.order(order, detail: false)
    data = order.slice(:number, :token, :status, :fulfillment_status, :fulfillment_method, :email, :total_cents, :currency, :created_at, :paid_at)
    data["item_count"] = order.order_items.sum(&:quantity)
    data["preorder_item_count"] = order.order_items.select(&:preorder_ships).sum(&:quantity)
    if detail
      data.merge!(order.slice(:shipping, :provider, :provider_payment_intent_id, :tracking_number, :tracking_url, :fulfilled_at, :notes, :subtotal_cents, :shipping_cents, :tax_cents, :shipping_method, :label_status, :label_url, :label_cost_cents, :label_bought_at, :tracking_status, :tracking_status_at, :attention_reason, :charged_cents, :refunded_cents, :refunded_at, :dispute_status))
      data["open_refund_cents"] = order.refund_requests.open.first&.amount_cents
      data["label_available"] = Shipping::Label.available?(order)
      data["items"] = order.order_items.map { |item| item.slice(:product_slug, :name, :quantity, :unit_price_cents, :image, :preorder_ships) }
      data["email_deliveries"] = order.email_deliveries.order(:id).map { |delivery| self.delivery(delivery) }
    end
    data
  end

  def self.product(product)
    product.slice(:slug, :name, :summary, :description, :price_cents, :currency, :status, :position, :specs, :includes, :art, :placeholders, :images, :kind, :stock_quantity, :signature, :per_customer_limit, :preorder, :preorder_ships).merge("drop" => product.drop && drop(product.drop),
      # Numbers in JSON: decimals would otherwise arrive as strings.
      **%w[weight_oz length_in width_in height_in].to_h { |field| [ field, product[field]&.to_f ] })
  end

  def self.drop(drop)
    CatalogSerializer.drop(drop).merge(quantity: drop.quantity, release_at: drop.release_at&.iso8601, product: drop.product&.slice(:slug, :name, :stock_quantity),
      products: drop.products.map { |product| product.slice(:slug, :name, :stock_quantity, :status) }, out_of_stock: drop.out_of_stock?)
  end

  # Admin only: what a run costs must never reach a public payload.
  def self.production_run(run)
    run.slice(:id, :quantity, :status, :supplier, :unit_cost_cents, :expected_at, :received_at, :stock_added, :notes, :created_at, :updated_at)
  end
end
