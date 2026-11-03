module Api
  module V1
    module Admin
      class StoreController < BaseController
        def show
          render json: { store: AdminSerializer.store }
        end

        def update
          attributes = params.permit(:sales_open, :contact_email, :tagline, :secondary_tagline, :story, mission_lines: [])
          StoreSetting.current.update!(attributes)
          render json: { store: AdminSerializer.store }
        end
      end
    end
  end
end
