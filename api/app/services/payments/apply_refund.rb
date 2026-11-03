module Payments
  class ApplyRefund
    # refunded_cents is the absolute total from Stripe, so replays and out-of-order
    # events cannot count a refund twice.
    def self.call(order, refunded_cents:)
      first_refund = false
      Orders::Inventory.with_locked_order(order) do |products|
        amount = refunded_cents.clamp(0, order.total_cents)
        next if amount <= order.refunded_cents
        first_refund = order.refunded_cents.zero?
        restock = order.status == "paid" && order.fulfillment_status == "unfulfilled"
        attributes = { refunded_cents: amount }
        if amount == order.total_cents
          attributes.merge!(status: "refunded", refunded_at: Time.current)
          if restock
            # Anything not yet shipped goes back on the shelf; shipped units stay with the customer.
            order.order_items.each { |item| Orders::Inventory.change!(products.fetch(item.product_id), order, item.quantity, "refund_restock") }
          end
        end
        order.update!(attributes)
        products.each_value { |product| Orders::Inventory.refresh_drop!(product) }
      end
      Emails::Notifications.refunded(order) if first_refund
      order.reload
    end
  end
end
