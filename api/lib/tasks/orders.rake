namespace :orders do
  desc "Release up to 100 expired holds and retry closing up to 100 released Stripe sessions"
  task release_expired: :environment do
    Orders::ReleaseExpired.call
    Payments::CloseReleasedSessions.call
  end
end
