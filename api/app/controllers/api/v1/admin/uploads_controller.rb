module Api
  module V1
    module Admin
      class UploadsController < BaseController
        def create
          product = Product.find_by!(slug: params[:product_slug].to_s)
          render json: ImageStorage.presign(product, widths: request.request_parameters["widths"], content_type: params[:content_type]), status: :created
        end
      end
    end
  end
end
