module Api
  module V1
    class StoreController < ApplicationController
      def show
        render json: { store: CatalogSerializer.store }
      end

      def page
        page = Page.find_by!(slug: params[:slug])
        render json: { page: { slug: page.slug, title: page.title, body: page.rendered_body, updated_at: page.updated_at.iso8601 } }
      end
    end
  end
end
