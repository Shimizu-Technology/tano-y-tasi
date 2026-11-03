class AdminSerializer
  def self.store
    CatalogSerializer.store
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
    data = order.slice(:number, :token, :status, :fulfillment_status, :email, :total_cents, :currency, :created_at, :paid_at)
    data["item_count"] = order.order_items.sum(&:quantity)
    if detail
      data.merge!(order.slice(:shipping, :provider, :provider_payment_intent_id, :tracking_number, :tracking_url, :fulfilled_at, :notes, :subtotal_cents, :attention_reason, :charged_cents, :refunded_cents, :refunded_at, :dispute_status))
      data["open_refund_cents"] = order.refund_requests.open.first&.amount_cents
      data["items"] = order.order_items.map { |item| item.slice(:product_slug, :name, :quantity, :unit_price_cents, :image) }
      data["email_deliveries"] = order.email_deliveries.order(:id).map { |delivery| self.delivery(delivery) }
    end
    data
  end

  def self.product(product)
    product.slice(:slug, :name, :summary, :description, :price_cents, :currency, :status, :position, :specs, :includes, :art, :placeholders, :images, :kind, :stock_quantity).merge("drop" => product.drop && drop(product.drop))
  end

  def self.drop(drop)
    CatalogSerializer.drop(drop).merge(quantity: drop.quantity, release_at: drop.release_at&.iso8601, product: drop.product&.slice(:slug, :name, :stock_quantity))
  end
end
