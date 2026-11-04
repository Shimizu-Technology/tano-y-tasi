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

    def self.change!(product, order, delta, reason, note: nil, production_run: nil)
      product.update!(stock_quantity: product.stock_quantity + delta)
      InventoryMovement.create!(product: product, order: order, delta: delta, balance: product.stock_quantity, reason: reason, note: note, production_run: production_run)
    end

    def self.adjust!(product, delta, note)
      product.with_lock do
        raise ApiError.new("invalid_adjustment", "Stock cannot be below zero.") if product.stock_quantity + delta < 0
        change!(product, nil, delta, "admin_adjustment", note: note)
        refresh_drop!(product)
      end
    end

    # Idempotent: a second receive, even with another count, changes nothing. A count of
    # zero records the receipt on the run alone, since the ledger holds only real changes.
    def self.receive!(run, stock_added: nil)
      run.product.with_lock do
        run.lock!
        next if run.status == "received"
        raise ApiError.new("invalid_production_run", "A canceled run can't be received.") unless run.status == "ordered"
        added = stock_added.nil? ? run.quantity : stock_added
        unless added.is_a?(Integer) && added.between?(0, run.quantity)
          message = "must be a whole number from 0 to #{run.quantity}. If more arrived, change the run's quantity first."
          raise ApiError.new("invalid_production_run", "Stock added #{message}", details: { stock_added: [ message ] })
        end
        change!(run.product, nil, added, "production_received", note: "Production run #{run.id}", production_run: run) unless added.zero?
        run.update!(status: "received", received_at: Time.current, stock_added: added)
        refresh_drop!(run.product)
      end
      run
    end

    # Same lock order as receiving, so canceling can't slip past a receive in progress.
    def self.cancel_run!(run)
      run.product.with_lock do
        run.lock!
        next if run.status == "canceled"
        raise ApiError.new("invalid_production_run", "A received run can't be canceled. Adjust stock instead.") unless run.status == "ordered"
        run.update!(status: "canceled")
      end
      run
    end

    def self.refresh_drop!(product)
      refresh_drops!([ product.drop_id ])
    end

    # Runs last, after any product and order locks, and locks drops in ID order. Two
    # checkouts finishing different products must take turns, or each could see the
    # other's hold and neither would record the sell-out.
    def self.refresh_drops!(drop_ids)
      drop_ids.compact.uniq.sort.each do |drop_id|
        drop = Drop.lock("FOR NO KEY UPDATE").find(drop_id)
        holds = OrderItem.joins(:order).where(product_id: drop.products.map(&:id), orders: { status: "pending_payment" }).exists?
        drop.update!(sold_out_at: drop.out_of_stock? && !holds ? (drop.sold_out_at || Time.current) : nil)
      end
    end
  end
end
