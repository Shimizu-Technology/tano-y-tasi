module Payments
  class Complete
    def self.call(order, payment_intent_id: nil, shipping: {})
      Orders::Inventory.with_locked_order(order) do |products|
        next if %w[paid refunded needs_attention].include?(order.status)
        over_limit = order.order_items.find do |item|
          product = products.fetch(item.product_id)
          product.drop && Orders::CustomerLimit.quantity(product, order.email, excluding_order: order) + item.quantity > product.drop.per_customer_limit
        end
        if over_limit
          if order.status == "pending_payment"
            order.order_items.each do |item|
              Orders::Inventory.change!(products.fetch(item.product_id), order, item.quantity, "release")
            end
          end
          order.update!(status: "needs_attention", paid_at: Time.current, provider_payment_intent_id: payment_intent_id, shipping: shipping)
          Rails.logger.error("PAYMENT_NEEDS_ATTENTION order_id=#{order.id} reason=customer_limit_exceeded product_id=#{over_limit.product_id} refund_required=true")
          products.each_value { |product| Orders::Inventory.refresh_drop!(product) }
          next
        end
        if order.status != "pending_payment"
          if order.order_items.any? { |item| products.fetch(item.product_id).stock_quantity < item.quantity }
            order.update!(status: "needs_attention", paid_at: Time.current, provider_payment_intent_id: payment_intent_id, shipping: shipping)
            Rails.logger.error("PAYMENT_NEEDS_ATTENTION order_id=#{order.id} reason=stock_unavailable refund_required=true")
            next
          end
          order.order_items.each do |item|
            Orders::Inventory.change!(products.fetch(item.product_id), order, -item.quantity, "late_payment_reserve")
          end
        end
        order.update!(status: "paid", paid_at: Time.current, provider_payment_intent_id: payment_intent_id, shipping: shipping)
        products.each_value { |product| Orders::Inventory.refresh_drop!(product) }
      end
      order.reload
    end
  end
end
