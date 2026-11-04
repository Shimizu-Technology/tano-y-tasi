module Api
  module V1
    module Admin
      class ProductionRunsController < BaseController
        before_action :find_product
        before_action :find_run, except: [ :index, :create ]

        def index
          render json: { production_runs: @product.production_runs.order(id: :desc).map { |run| AdminSerializer.production_run(run) } }
        end

        def create
          run = @product.production_runs.create!(attributes)
          render json: { production_run: AdminSerializer.production_run(run) }, status: :created
        end

        def update
          @run.with_lock { @run.update!(attributes) }
          render_run
        end

        def receive
          Orders::Inventory.receive!(@run, stock_added: params[:stock_added])
          render_run
        end

        def cancel
          Orders::Inventory.cancel_run!(@run)
          render_run
        end

        private

        def attributes
          params.permit(:quantity, :supplier, :unit_cost_cents, :expected_at, :notes)
        end

        def find_product
          @product = Product.find_by!(slug: params[:product_slug])
        end

        def find_run
          @run = @product.production_runs.find(params[:id])
        end

        def render_run
          render json: { production_run: AdminSerializer.production_run(@run.reload), product: AdminSerializer.product(@product.reload) }
        end
      end
    end
  end
end
