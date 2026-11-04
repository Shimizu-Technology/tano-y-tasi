module Api
  module V1
    class CheckoutController < ApplicationController
      def create
        if params[:items].is_a?(Array) && params[:items].any? { |item| !item.is_a?(ActionController::Parameters) }
          raise ApiError.new("quantity_invalid", "Each cart item must contain a product and quantity.")
        end
        payload = params.permit(:email, :idempotency_key, items: [ :product_slug, :quantity ], shipping: [ :quote, { address: ShippingController::ADDRESS_FIELDS } ]).to_h.deep_symbolize_keys
        # Preserve malformed array shape so strong params cannot turn it into an empty cart.
        if params.key?(:items) && !params[:items].is_a?(Array)
          raise ApiError.new("quantity_invalid", "items must be an array.")
        end
        result = Orders::Checkout.call(payload)
        render json: { order: CatalogSerializer.order(result.order, summary: true), payment_url: result.order.payment_url }, status: result.created ? :created : :ok
      end
    end
  end
end
