module Api
  module V1
    class SimulatedPaymentsController < ApplicationController
      before_action do
        raise ActiveRecord::RecordNotFound unless Payments::Gateway.simulated?
      end

      def complete
        order = simulated_order
        Payments::ProcessEvent.call(provider: "simulated", event_id: "sim_complete_#{order.token}",
          event_type: "checkout.session.completed", order: order, payment_intent_id: "sim_pi_#{order.token}")
        render json: { order: CatalogSerializer.order(order.reload) }
      end

      def cancel
        order = Orders::Release.call(simulated_order)
        render json: { order: CatalogSerializer.order(order) }
      end

      private

      def simulated_order
        Order.find_by!(token: params[:token], provider: "simulated")
      end
    end
  end
end
