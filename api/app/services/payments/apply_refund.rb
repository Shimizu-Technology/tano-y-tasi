module Payments
  class ApplyRefund
    # refunded_cents is the current total from Stripe, so replays and out-of-order
    # events can't count a refund twice, and a refund that failed lowers it again.
    def self.call(order, refunded_cents:)
      Orders::Inventory.with_locked_order(order) do |products|
        amount = [ refunded_cents, 0 ].max
        next if amount == order.refunded_cents
        amount < order.refunded_cents ? reverse(order, amount) : increase(order, amount, products)
        products.each_value { |product| Orders::Inventory.refresh_drop!(product) }
      end
      order.reload
    end

    def self.increase(order, amount, products)
      first_refund = order.refunded_cents.zero?
      restock = order.status == "paid" && order.fulfillment_status == "unfulfilled"
      attributes = { refunded_cents: amount }
      attributes[:attention_reason] = nil if order.attention_reason == "refund_failed"
      if amount >= order.paid_cents
        attributes.merge!(status: "refunded", refunded_at: Time.current)
        if restock
          # Anything not yet shipped goes back on the shelf; shipped units stay with the customer.
          order.order_items.each { |item| Orders::Inventory.change!(products.fetch(item.product_id), order, item.quantity, "refund_restock") }
        end
      end
      order.update!(attributes)
      # Recorded in this transaction so a crash can't lose the email.
      Emails::Notifications.refunded(order) if first_refund
    end

    # Stock stays where it is: mark_paid takes it back if the merchant ships the order.
    def self.reverse(order, amount)
      attributes = { refunded_cents: amount, attention_reason: "refund_failed" }
      attributes.merge!(status: "needs_attention", refunded_at: nil) if order.status == "refunded"
      order.update!(attributes)
      Rails.logger.error("REFUND_REVERSED order_id=#{order.id} refunded_cents=#{amount}")
      Emails::Notifications.attention(order)
    end
    private_class_method :increase, :reverse
  end
end
