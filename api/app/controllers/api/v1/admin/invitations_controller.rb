module Api
  module V1
    module Admin
      class InvitationsController < BaseController
        def create
          email = params.permit(:email)[:email].to_s.strip.downcase
          candidate = AdminInvitation.new(email: email, invited_by: @current_user)
          candidate.validate!
          invitation = AdminLock.with(AdminLock.admin_email_key(email)) do
            existing = AdminInvitation.pending.find_by(email: email)
            next existing if existing
            response = ClerkClient.request(:post, "invitations", email_address: email, redirect_url: "#{Emails::Template.frontend_url}/admin/sign-up", ignore_existing: true)
            raise ClerkClient::Unavailable, "Clerk invitation ID missing" if response["id"].blank?
            candidate.update!(clerk_invitation_id: response.fetch("id"))
            candidate
          end
          render json: { invitation: AdminSerializer.invitation(invitation) }, status: :created
        end

        def destroy
          invitation = AdminInvitation.find(params[:id])
          AdminInvitationRevocation.call(invitation)
          render json: { invitation: AdminSerializer.invitation(invitation) }
        end
      end
    end
  end
end
