module Api
  module V1
    class CatalogController < ApplicationController
      before_action { Orders::ReleaseExpired.call }

      def storefront
        drops = public_drops.to_a
        featured = drops.find { |drop| drop.state == "live" } || upcoming(drops).first
        render json: { featured_drop: featured && CatalogSerializer.drop(featured, with_product: true),
          core_products: Product.visible.includes(:drop).where(kind: "core").map { |product| CatalogSerializer.product(product) }, store: CatalogSerializer.store, server_time: Time.current.iso8601 }
      end

      def products
        products = Product.visible.includes(:drop)
        if params[:kind].present?
          raise ApiError.new("malformed", "kind must be core or drop.", status: :bad_request) unless %w[core drop].include?(params[:kind])
          products = products.where(kind: params[:kind])
        end
        render json: { products: products.map { |product| CatalogSerializer.product(product) }, server_time: Time.current.iso8601 }
      end

      def product
        product = Product.visible.includes(:drop).find_by!(slug: params[:slug])
        render json: { product: CatalogSerializer.product(product, detail: true), server_time: Time.current.iso8601 }
      end

      def drops
        drops = public_drops.to_a
        render json: { current: drops.find { |drop| drop.state == "live" }&.then { |drop| CatalogSerializer.drop(drop, with_product: true) },
          upcoming: upcoming(drops).map { |drop| CatalogSerializer.drop(drop, with_product: true) },
          archive: drops.select { |drop| %w[sold_out closed].include?(drop.state) }.sort_by(&:release_at).reverse.map { |drop| CatalogSerializer.drop(drop, with_product: true) },
          server_time: Time.current.iso8601 }
      end

      def drop
        drop = public_drops.find_by!(slug: params[:slug])
        render json: { drop: CatalogSerializer.drop(drop, with_product: true, detail: true), server_time: Time.current.iso8601 }
      end

      private

      # Dated drops come first, soonest first; unannounced drops follow in number order.
      def upcoming(drops)
        drops.select { |drop| drop.state == "upcoming" }.sort_by { |drop| [ drop.release_at ? 0 : 1, drop.release_at.to_f, drop.number ] }
      end

      def public_drops
        Drop.joins(:product).merge(Product.shown).includes(:product).order(:release_at)
      end
    end
  end
end
