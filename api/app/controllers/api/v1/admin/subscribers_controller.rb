require "csv"

module Api
  module V1
    module Admin
      class SubscribersController < BaseController
        def index
          scope = Subscriber.order(created_at: :desc, id: :desc)
          if request.format.csv?
            csv = CSV.generate do |rows|
              rows << %w[email source drop_slug created_at]
              scope.each do |subscriber|
                rows << [ subscriber.email, subscriber.source, subscriber.drop_slug, subscriber.created_at.iso8601 ].map { |value| csv_safe(value) }
              end
            end
            send_data csv, filename: "tano-y-tasi-subscribers.csv", type: "text/csv; charset=utf-8"
          else
            render json: paginate(scope, :subscribers) { |subscriber| subscriber.slice(:email, :source, :drop_slug, :created_at) }
          end
        end

        private

        def csv_safe(value)
          value.to_s.match?(/\A[=+\-@\t\r\n]/) ? "'#{value}" : value
        end
      end
    end
  end
end
