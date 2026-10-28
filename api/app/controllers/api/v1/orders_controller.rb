module Api
  module V1
    class OrdersController < ApplicationController
      def show
        render json: { order: CatalogSerializer.order(Order.find_by!(token: params[:token])) }
      end

      def cancel
        order = Orders::Release.call(Order.find_by!(token: params[:token]))
        render json: { order: CatalogSerializer.order(order) }
      end
    end
  end
end
