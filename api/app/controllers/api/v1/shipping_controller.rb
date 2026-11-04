module Api
  module V1
    class ShippingController < ApplicationController
      ADDRESS_FIELDS = %i[name line1 line2 city state postal_code phone country].freeze

      def quotes
        if params[:items].is_a?(Array) && params[:items].any? { |item| !item.is_a?(ActionController::Parameters) }
          raise ApiError.new("quantity_invalid", "Each cart item must contain a product and quantity.")
        end
        raise ApiError.new("quantity_invalid", "items must be an array.") if params.key?(:items) && !params[:items].is_a?(Array)
        payload = params.permit(items: [ :product_slug, :quantity ]).to_h.deep_symbolize_keys
        items = Orders::CartItems.parse!(payload[:items])
        raise ApiError.new("store_closed", "The store isn't open for orders yet. Join the list and you'll hear first.") unless StoreSetting.sales_open?
        address = Shipping::Address.parse!(params[:address].respond_to?(:permit) ? params[:address].permit(*ADDRESS_FIELDS).to_h : {})
        render json: { options: Shipping::Quote.call(address: address, lines: lines(items)), tax_enabled: StoreSetting.current.tax_enabled }
      end

      private

      # Nothing is held here. Stock and limits are checked again when checkout reserves.
      def lines(items)
        products = Product.includes(:drop).where(slug: items.map { |item| item[:product_slug] }).index_by(&:slug)
        items.map do |item|
          product = products[item[:product_slug]]
          raise ApiError.new("unknown_product", "This product is unavailable.") unless product&.on_sale?
          check_buyable!(product)
          Shipping::Parcel::Line.new(product: product, quantity: item[:quantity], unit_price_cents: product.price_cents)
        end
      end

      def check_buyable!(product)
        case product.availability[:state]
        when "sold_out"
          raise ApiError.new("sold_out", "#{product.name} just sold out.", details: { product_slug: product.slug, available: 0 })
        when "upcoming", "closed"
          raise ApiError.new("drop_not_live", "This drop is not open for checkout.", details: { product_slug: product.slug, release_at: product.drop&.release_at&.iso8601 })
        end
      end
    end
  end
end
