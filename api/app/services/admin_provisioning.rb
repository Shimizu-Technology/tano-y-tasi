class AdminProvisioning
  def self.call(clerk_id)
    existing = User.find_by(clerk_id: clerk_id)
    return existing if existing
    profile = ClerkIdentity.profile(clerk_id)
    return nil unless profile

    AdminLock.with_transaction(AdminLock.admin_email_key(profile[:email])) do
      existing = User.find_by(clerk_id: clerk_id)
      next existing if existing

      email_owner = User.find_by(email: profile[:email])
      if email_owner
        unless email_owner.active?
          Rails.logger.warn("ADMIN_PROVISIONING_INACTIVE_EMAIL email=#{profile[:email]} attempted_clerk_id=#{clerk_id}")
          next
        end

        if email_owner.clerk_id != clerk_id
          Rails.logger.warn("ADMIN_PROVISIONING_EMAIL_CONFLICT email=#{profile[:email]} existing_clerk_id=#{email_owner.clerk_id} attempted_clerk_id=#{clerk_id}")
          next
        end

        next email_owner
      end

      invitation = AdminInvitation.pending.find_by(email: profile[:email])
      allowed = ENV.fetch("ADMIN_EMAILS", "").split(",").map { |email| email.strip.downcase }
      next unless invitation || allowed.include?(profile[:email])
      user = User.create!(clerk_id: clerk_id, **profile)
      invitation&.update!(accepted_at: Time.current)
      user
    end
  rescue ActiveRecord::RecordNotUnique
    canonical = User.find_by(clerk_id: clerk_id)
    canonical if canonical&.email == profile[:email]
  end
end
