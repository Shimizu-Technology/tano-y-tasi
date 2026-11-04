module Api
  module V1
    module Admin
      class ProductsController < BaseController
        before_action :find_product, except: [ :index, :create ]

        def index
          render json: { products: Product.includes(drop: :products).order(:position, :id).map { |product| AdminSerializer.product(product) } }
        end

        def show
          render_product
        end

        def create
          attributes = content.merge(AdminCatalog.placement(params[:kind], params[:drop_slug]))
          render json: { product: AdminSerializer.product(AdminCatalog.create_product(attributes)) }, status: :created
        end

        def update
          attributes = content
          attributes.merge!(AdminCatalog.placement(params[:kind], params[:drop_slug], product: @product)) if params.key?(:kind) || params.key?(:drop_slug)
          attributes[:images] = AdminCatalog.images(request.request_parameters["images"]) if request.request_parameters.key?("images")
          AdminCatalog.update_product(@product, attributes)
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
          render json: { inventory_movements: InventoryMovement.where(product: @product).order(id: :desc).limit(50).map { |movement| movement.slice(:id, :delta, :balance, :reason, :note, :order_id, :production_run_id, :created_at) } }
        end

        private

        def content
          params.permit(:name, :summary, :description, :price_cents, :status, :position, :signature, :per_customer_limit, :preorder, :preorder_ships, specs: {}, includes: [], art: [ :credit, :story ], placeholders: []).to_h.tap { |values| AdminCatalog.check_flags!(values) }
        end

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
