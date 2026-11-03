namespace :maintenance do
  desc "Hourly upkeep: expired holds, unclosed Stripe sessions, failed emails, stale leases"
  task run: :environment do
    Orders::ReleaseExpired.call
    Payments::CloseReleasedSessions.call
    EmailDelivery.retryable.find_each(&:deliver!)
    ProviderLease.purge_expired
  end
end
