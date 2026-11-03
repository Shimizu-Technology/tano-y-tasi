module Api
  module V1
    module Admin
      class PagesController < BaseController
        def index
          render json: { pages: Page.order(:id).map { |page| AdminSerializer.page(page) } }
        end

        def show
          render json: { page: AdminSerializer.page(find_page) }
        end

        def update
          page = find_page
          page.update!(params.permit(:title, :body))
          render json: { page: AdminSerializer.page(page) }
        end

        private

        def find_page
          Page.find_by!(slug: params[:slug])
        end
      end
    end
  end
end
