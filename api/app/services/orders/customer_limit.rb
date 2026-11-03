module Orders
  module CustomerLimit
    # Call while holding the product lock, just like inventory transitions.
    def self.quantity(product, email, excluding_order: nil)
      # A release that predates customer_key can still write orders during a deploy.
      items = OrderItem.joins(:order)
        .where(product: product)
        .where("orders.customer_key = :key OR (orders.customer_key IS NULL AND orders.email = :email)", key: Order.customer_key_for(email), email: email)
        .where("orders.status IN ('paid', 'pending_payment') OR (orders.status = 'needs_attention' AND orders.paid_at IS NOT NULL)")
      items = items.where.not(order_id: excluding_order.id) if excluding_order
      items.sum(:quantity)
    end
  end
end
