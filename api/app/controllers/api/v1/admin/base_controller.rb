module Api
  module V1
    module Admin
      class BaseController < ApplicationController
        before_action :authenticate_admin!
        rescue_from ClerkClient::Unavailable do |error|
          Rails.logger.error("ADMIN_IDENTITY_UNAVAILABLE #{error.message}")
          render_error("identity_unavailable", "Admin identity is temporarily unavailable.", :service_unavailable)
        end
        rescue_from ProviderLease::Busy do
          render_error("busy", "Another request for this is still running. Try again in a moment.", :conflict)
        end
        rescue_from ActiveRecord::RecordInvalid do |error|
          render_error("invalid_record", error.record.errors.full_messages.join(", "), :unprocessable_content)
        end

        private

        def authenticate_admin!
          # Configuration is checked on access, never during storefront boot.
          unless ClerkAuthenticator.configured?
            raise ClerkClient::Unavailable, "Required Clerk configuration is missing or invalid"
          end
          token = request.headers["Authorization"].to_s.match(/\ABearer ([^ ]+)\z/)&.captures&.first
          identity = ClerkAuthenticator.verify(token)
          return render_error("unauthenticated", "Sign in to continue.", :unauthorized) unless identity
          @current_user = AdminProvisioning.call(identity.fetch("sub"))
          unless @current_user&.active? && @current_user.role == "admin"
            return render_error("forbidden", "Admin access is required.", :forbidden)
          end
          @current_user.update!(last_signed_in_at: Time.current)
        end

        def paginate(scope, key)
          page = [ params[:page].to_i, 1 ].max
          total = scope.count
          { key => scope.offset((page - 1) * 25).limit(25).map { |record| yield record }, page: page, pages: (total / 25.0).ceil, total: total }
        end
      end
    end
  end
end
