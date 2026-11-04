module Orders
  module CustomerLimit
    # Would this quantity take the customer over the product's effective limit?
    def self.exceeded?(product, email, quantity, excluding_order: nil)
      limit = product.effective_limit
      limit.present? && quantity(product, email, excluding_order: excluding_order) + quantity > limit
    end

    # Call while holding the product lock, just like inventory transitions.
    def self.quantity(product, email, excluding_order: nil)
      items = OrderItem.joins(:order).where(product: product, orders: { customer_key: Order.customer_key_for(email) })
        .where("orders.status IN ('paid', 'pending_payment') OR (orders.status = 'needs_attention' AND orders.paid_at IS NOT NULL)")
      items = items.where.not(order_id: excluding_order.id) if excluding_order
      items.sum(:quantity)
    end
  end
end
