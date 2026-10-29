module Api
  module V1
    module Admin
      class UsersController < BaseController
        def index
          render json: { users: User.admins.order(:id).map { |user| AdminSerializer.user(user) }, invitations: AdminInvitation.pending.order(:id).map { |invitation| AdminSerializer.invitation(invitation) } }
        end

        def update
          attributes = params.permit(:active)
          unless attributes.key?(:active) && ActiveModel::Type::Boolean.new.cast(attributes[:active]) == false
            raise ApiError.new("invalid_user", "Only deactivation is supported.")
          end
          User.transaction do
            # A single ordered set of locks prevents concurrent last-admin removals.
            admins = User.admins.order(:id).lock.to_a
            user = User.find(params[:id])
            if user.id == @current_user.id || (user.active? && admins.size <= 1)
              raise ApiError.new("invalid_user", "You cannot deactivate yourself or the last active admin.")
            end
            user.update!(active: false)
            render json: { user: AdminSerializer.user(user) }
          end
        end
      end
    end
  end
end
