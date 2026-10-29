module Orders
  module Inventory
    # All transitions lock products in ascending ID order, then the order.
    def self.with_locked_order(order)
      Order.transaction do
        products = Product.where(id: order.order_items.select(:product_id)).order(:id).lock.to_a
        order.lock!
        yield products.index_by(&:id)
      end
    end

    def self.change!(product, order, delta, reason)
      product.update!(stock_quantity: product.stock_quantity + delta)
      InventoryMovement.create!(product: product, order: order, delta: delta, balance: product.stock_quantity, reason: reason)
    end

    def self.adjust!(product, delta, note)
      product.with_lock do
        raise ApiError.new("invalid_adjustment", "Stock cannot be below zero.") if product.stock_quantity + delta < 0
        change!(product, nil, delta, "admin_adjustment")
        InventoryMovement.where(product: product).order(id: :desc).first.update!(note: note)
        refresh_drop!(product)
      end
    end

    def self.refresh_drop!(product)
      return unless product.drop
      holds = OrderItem.joins(:order).where(product_id: product.id, orders: { status: "pending_payment" }).exists?
      product.drop.update!(sold_out_at: product.stock_quantity.zero? && !holds ? (product.drop.sold_out_at || Time.current) : nil)
    end
  end
end
