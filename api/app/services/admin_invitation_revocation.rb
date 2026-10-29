class AdminInvitationRevocation
  def self.call(invitation)
    provider_invitation_id = AdminLock.with_transaction(AdminLock.admin_email_key(invitation.email)) do
      invitation.reload
      if invitation.accepted_at
        raise ApiError.new("invalid_invitation", "This invitation has already been accepted.")
      end

      invitation.update!(revoked_at: Time.current) unless invitation.revoked_at
      invitation.clerk_invitation_id
    end

    return invitation unless provider_invitation_id.present?

    ClerkClient.request(:post, "invitations/#{ERB::Util.url_encode(provider_invitation_id)}/revoke")
    AdminLock.with_transaction(AdminLock.admin_email_key(invitation.email)) do
      invitation.reload
      invitation.update!(clerk_invitation_id: nil) if invitation.clerk_invitation_id == provider_invitation_id
    end
    invitation
  end
end
