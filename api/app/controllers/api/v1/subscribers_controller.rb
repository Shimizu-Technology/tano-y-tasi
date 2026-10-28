module Api
  module V1
    class SubscribersController < ApplicationController
      def create
        attributes = params.permit(:email, :source, :drop_slug).to_h
        unless attributes["email"].is_a?(String)
          raise ApiError.new("invalid_email", "Enter a valid email address.")
        end
        subscriber = Subscriber.new(attributes)
        unless subscriber.valid?
          code = subscriber.errors[:email].any? ? "invalid_email" : "malformed"
          raise ApiError.new(code, "Check your email address and signup details.", status: code == "malformed" ? :bad_request : :unprocessable_content)
        end
        existing = Subscriber.find_by(email: subscriber.email)
        subscriber.save! unless existing
        render json: { subscribed: true }, status: existing ? :ok : :created
      rescue ActiveRecord::RecordNotUnique
        render json: { subscribed: true }
      end
    end
  end
end
