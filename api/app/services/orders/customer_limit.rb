module Orders
  module CustomerLimit
    # Call while holding the product lock, just like inventory transitions.
    def self.quantity(product, email, excluding_order: nil)
      items = OrderItem.joins(:order).where(product: product, orders: { email: email })
        .where("orders.status IN ('paid', 'pending_payment') OR (orders.status = 'needs_attention' AND orders.paid_at IS NOT NULL)")
      items = items.where.not(order_id: excluding_order.id) if excluding_order
      items.sum(:quantity)
    end
  end
end
