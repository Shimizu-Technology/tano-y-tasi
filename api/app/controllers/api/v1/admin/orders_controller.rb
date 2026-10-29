module Api
  module V1
    module Admin
      class OrdersController < BaseController
        before_action :find_order, except: :index

        def index
          scope = Order.includes(:order_items).order(created_at: :desc, id: :desc)
          scope = scope.where(status: params[:status]) if params[:status].present?
          scope = scope.where(fulfillment_status: params[:fulfillment]) if params[:fulfillment].present?
          if params[:q].present?
            query = "%#{Order.sanitize_sql_like(params[:q])}%"
            scope = scope.where("number ILIKE :q OR email ILIKE :q", q: query)
          end
          render json: paginate(scope, :orders) { |order| AdminSerializer.order(order) }
        end

        def show
          render_order
        end

        def update
          @order.update!(params.permit(:notes))
          render_order
        end

        def fulfill
          attributes = params.permit(:tracking_number, :tracking_url, :notify)
          @order.with_lock do
            raise ApiError.new("invalid_fulfillment", "Only paid orders can be fulfilled.") unless @order.status == "paid"
            unless @order.fulfillment_status == "fulfilled"
              @order.update!(attributes.except(:notify).to_h.merge(fulfillment_status: "fulfilled", fulfilled_at: Time.current))
              Emails::Notifications.shipped(@order) if ActiveModel::Type::Boolean.new.cast(attributes[:notify])
            end
          end
          render_order
        end

        def unfulfill
          @order.with_lock { @order.update!(fulfillment_status: "unfulfilled", fulfilled_at: nil) }
          render_order
        end

        def resend
          delivery = @order.email_deliveries.find(params[:id])
          delivery.deliver!(resend: true)
          render json: { email_delivery: AdminSerializer.delivery(delivery.reload) }
        end

        private

        def find_order
          @order = Order.find_by!(number: params[:number])
        end

        def render_order
          render json: { order: AdminSerializer.order(@order.reload, detail: true) }
        end
      end
    end
  end
end
