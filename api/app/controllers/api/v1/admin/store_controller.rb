module Api
  module V1
    module Admin
      class StoreController < BaseController
        def show
          render json: { store: AdminSerializer.store }
        end

        def update
          attributes = params.permit(:sales_open, :contact_email, :tagline, :secondary_tagline, :story, mission_lines: [])
          store = StoreSetting.current
          store.update!(attributes)
          close_open_checkouts if store.saved_change_to_sales_open? && !store.sales_open
          render json: { store: AdminSerializer.store }
        end

        private

        # Closing means closed: nobody can finish a checkout they already started.
        # Holds are released first, and Stripe is called outside any lock.
        def close_open_checkouts
          Order.holding.find_each do |order|
            Orders::Release.call(order)
            Payments::Gateway.expire_session(order)
          end
        end
      end
    end
  end
end
