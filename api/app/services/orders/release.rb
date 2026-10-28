module Orders
  class Release
    def self.call(order, status: "canceled", expired_before: nil)
      Inventory.with_locked_order(order) do |products|
        next unless order.status == "pending_payment"
        next if expired_before && order.expires_at >= expired_before
        order.order_items.each do |item|
          Inventory.change!(products.fetch(item.product_id), order, item.quantity, "release")
        end
        order.update!(status: status)
        products.each_value { |product| Inventory.refresh_drop!(product) }
      end
      order.reload
    end
  end
end
