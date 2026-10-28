module Api
  module V1
    class OrdersController < ApplicationController
      def show
        render json: { order: CatalogSerializer.order(Order.find_by!(token: params[:token])) }
      end

      def cancel
        order = Order.find_by!(token: params[:token])
        was_pending = order.status == "pending_payment"
        order = Orders::Release.call(order)
        Payments::Gateway.expire_session(order) if was_pending && order.status == "canceled"
        render json: { order: CatalogSerializer.order(order) }
      end
    end
  end
end
