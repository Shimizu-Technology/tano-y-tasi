module Payments
  class Complete
    # A problem from the provider (for example an amount that does not match the
    # order) flags the payment for review instead of losing it.
    def self.call(order, payment_intent_id: nil, shipping: {}, problem: nil, charged_cents: nil)
      Orders::Inventory.with_locked_order(order) do |products|
        next if %w[paid refunded needs_attention].include?(order.status)
        holding = order.status == "pending_payment"
        reason = problem || withdrawn_reason(order, products) || over_limit_reason(order, products) || (!holding && stock_reason(order, products))
        attributes = { paid_at: Time.current, provider_payment_intent_id: payment_intent_id, shipping: shipping, charged_cents: charged_cents }
        if reason
          if holding
            order.order_items.each { |item| Orders::Inventory.change!(products.fetch(item.product_id), order, item.quantity, "release") }
          end
          order.update!(attributes.merge(status: "needs_attention", attention_reason: reason))
          Rails.logger.error("PAYMENT_NEEDS_ATTENTION order_id=#{order.id} reason=#{reason} refund_required=true")
          # Recorded in this transaction so a crash can't lose the alert.
          Emails::Notifications.attention(order)
        else
          unless holding
            order.order_items.each { |item| Orders::Inventory.change!(products.fetch(item.product_id), order, -item.quantity, "late_payment_reserve") }
          end
          order.update!(attributes.merge(status: "paid"))
        end
        products.each_value { |product| Orders::Inventory.refresh_drop!(product) }
      end
      order.reload
    end

    # The merchant moved the drop back to Coming soon after this checkout started.
    def self.withdrawn_reason(order, products)
      "drop_withdrawn" if order.order_items.any? { |item| (drop = products.fetch(item.product_id).drop) && !drop.released? }
    end

    def self.over_limit_reason(order, products)
      over = order.order_items.any? do |item|
        product = products.fetch(item.product_id)
        product.drop && Orders::CustomerLimit.quantity(product, order.email, excluding_order: order) + item.quantity > product.drop.per_customer_limit
      end
      "customer_limit_exceeded" if over
    end

    def self.stock_reason(order, products)
      "stock_unavailable" if order.order_items.any? { |item| products.fetch(item.product_id).stock_quantity < item.quantity }
    end
    private_class_method :withdrawn_reason, :over_limit_reason, :stock_reason
  end
end
