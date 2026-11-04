module Api
  module V1
    module Admin
      class ShippingController < BaseController
        FIELDS = [ :mode, :handling_fee_cents, :free_shipping_threshold_cents, :pickup_enabled, :pickup_instructions, :tax_enabled,
          { carriers: [] }, { flat_rates: Shipping::Settings::ZONES }, { origin: Shipping::Settings::DEFAULTS["origin"].keys },
          { parcel: Shipping::Settings::DEFAULTS["parcel"].keys }, { customs: Shipping::Settings::DEFAULTS["customs"].keys } ].freeze

        def show
          render json: { shipping: AdminSerializer.shipping }
        end

        def update
          patch = params.permit(*FIELDS).to_h
          tax = patch.delete(:tax_enabled)
          invalid!("tax_enabled" => [ "must be true or false" ]) if params.key?(:tax_enabled) && ![ true, false ].include?(tax)
          store = StoreSetting.current
          merged = store.shipping_settings.deep_merge(patch)
          errors = Shipping::Settings.errors_for(patch, Shipping::Settings.new(merged))
          invalid!(errors) if errors.any?
          attributes = { shipping_settings: merged }
          attributes[:tax_enabled] = tax if params.key?(:tax_enabled)
          attributes[:flat_rates_saved_at] = Time.current if patch.key?(:flat_rates)
          store.update!(attributes)
          render json: { shipping: AdminSerializer.shipping }
        end

        private

        def invalid!(errors)
          raise ApiError.new("invalid_record", "Check the highlighted shipping settings.", details: errors)
        end
      end
    end
  end
end
