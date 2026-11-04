module Api
  module V1
    module Admin
      class DropsController < BaseController
        def index
          render json: { drops: Drop.includes(:products).order(:number).map { |drop| AdminSerializer.drop(drop) } }
        end

        def show
          render json: { drop: AdminSerializer.drop(Drop.find_by!(slug: params[:slug])) }
        end

        def create
          render json: { drop: AdminSerializer.drop(AdminCatalog.create_drop(attributes)) }, status: :created
        end

        def update
          drop = Drop.find_by!(slug: params[:slug])
          drop.update!(attributes)
          render json: { drop: AdminSerializer.drop(drop) }
        end

        private

        def attributes
          params.permit(:name, :release_at, :closes_at, :per_customer_limit, :quantity).to_h.tap { |values| AdminCatalog.check_times!(values) }
        end
      end
    end
  end
end
