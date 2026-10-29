module Api
  module V1
    module Admin
      class InvitationsController < BaseController
        def create
          email = params.permit(:email)[:email].to_s.strip.downcase
          candidate = AdminInvitation.new(email: email, invited_by: @current_user)
          candidate.validate!
          invitation = AdminLock.with("admin-invitation-#{email}") do
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
          AdminLock.with("admin-invitation-#{invitation.email}") do
            invitation.reload
            if invitation.accepted_at
              raise ApiError.new("invalid_invitation", "This invitation has already been accepted.")
            end
            unless invitation.revoked_at
              ClerkClient.request(:post, "invitations/#{ERB::Util.url_encode(invitation.clerk_invitation_id)}/revoke")
              invitation.update!(revoked_at: Time.current)
            end
          end
          render json: { invitation: AdminSerializer.invitation(invitation) }
        end
      end
    end
  end
end
