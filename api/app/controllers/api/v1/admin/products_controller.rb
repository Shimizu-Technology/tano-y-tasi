module Api
  module V1
    module Admin
      class ProductsController < BaseController
        before_action :find_product, except: :index

        def index
          render json: { products: Product.includes(:drop).order(:position, :id).map { |product| AdminSerializer.product(product) } }
        end

        def show
          render_product
        end

        def update
          @product.update!(params.permit(:name, :summary, :description, :price_cents, :status, :position, specs: {}, includes: [], art: [ :credit, :story ], placeholders: []))
          render_product
        end

        def stock_adjustments
          attributes = params.permit(:delta, :reason)
          delta = attributes[:delta]
          unless delta.is_a?(Integer) && !delta.zero? && attributes[:reason].is_a?(String) && attributes[:reason].strip.present?
            raise ApiError.new("invalid_adjustment", "Provide a nonzero integer delta and a reason.")
          end
          Orders::Inventory.adjust!(@product, delta, attributes[:reason].strip)
          render_product
        end

        def inventory_movements
          render json: { inventory_movements: InventoryMovement.where(product: @product).order(id: :desc).limit(50).map { |movement| movement.slice(:id, :delta, :balance, :reason, :note, :order_id, :created_at) } }
        end

        private

        def find_product
          @product = Product.find_by!(slug: params[:slug])
        end

        def render_product
          render json: { product: AdminSerializer.product(@product.reload) }
        end
      end
    end
  end
end
