module Api
  module V1
    module Admin
      class DropsController < BaseController
        def index
          render json: { drops: Drop.includes(:product).order(:number).map { |drop| AdminSerializer.drop(drop) } }
        end

        def show
          render json: { drop: AdminSerializer.drop(Drop.find_by!(slug: params[:slug])) }
        end

        def update
          drop = Drop.find_by!(slug: params[:slug])
          drop.update!(params.permit(:name, :release_at, :closes_at, :per_customer_limit, :quantity))
          render json: { drop: AdminSerializer.drop(drop) }
        end
      end
    end
  end
end
