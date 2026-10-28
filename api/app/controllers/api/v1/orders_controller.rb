module Api
  module V1
    class OrdersController < ApplicationController
      def show
        render json: { order: CatalogSerializer.order(Order.find_by!(token: params[:token])) }
      end

      def cancel
        order = Order.find_by!(token: params[:token])
        order = Orders::Release.call(order)
        Payments::Gateway.expire_session(order) if %w[canceled expired].include?(order.status)
        render json: { order: CatalogSerializer.order(order) }
      end
    end
  end
end
