module Api
  module V1
    module Admin
      class DashboardController < BaseController
        def me
          render json: { user: AdminSerializer.user(@current_user) }
        end

        def show
          # A drop with no product attached has nothing to feature yet.
          drops = Drop.joins(:product).includes(:product).order(:release_at).to_a
          featured = drops.find { |drop| drop.state == "live" } || drops.find { |drop| drop.state == "upcoming" }
          paid = Order.where(status: "paid")
          render json: {
            orders: { paid_count: paid.count, paid_total_cents: paid.sum(:total_cents), unfulfilled_count: paid.where(fulfillment_status: "unfulfilled").count, needs_attention_count: Order.where(status: "needs_attention").count },
            recent_orders: Order.includes(:order_items).order(created_at: :desc, id: :desc).limit(10).map { |order| AdminSerializer.order(order) },
            featured_drop: featured && AdminSerializer.drop(featured),
            low_stock: Product.where("stock_quantity <= ?", 20).order(:stock_quantity, :id).map { |product| product.slice(:slug, :name, :stock_quantity) },
            subscribers_count: Subscriber.count
          }
        end
      end
    end
  end
end
