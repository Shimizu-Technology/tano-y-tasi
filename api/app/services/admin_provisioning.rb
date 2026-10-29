class AdminProvisioning
  def self.call(clerk_id)
    existing = User.find_by(clerk_id: clerk_id)
    return existing if existing
    profile = ClerkIdentity.profile(clerk_id)
    return nil unless profile
    User.transaction(requires_new: true) do
      # Lock invitations so acceptance cannot race revocation.
      invitation = AdminInvitation.pending.lock.find_by(email: profile[:email])
      existing = User.find_by(clerk_id: clerk_id)
      next existing if existing
      allowed = ENV.fetch("ADMIN_EMAILS", "").split(",").map { |email| email.strip.downcase }
      next unless invitation || allowed.include?(profile[:email])
      user = User.create!(clerk_id: clerk_id, **profile)
      invitation&.update!(accepted_at: Time.current)
      user
    end
  rescue ActiveRecord::RecordNotUnique
    User.find_by(clerk_id: clerk_id)
  end
end
