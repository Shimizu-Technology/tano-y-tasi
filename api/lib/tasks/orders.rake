namespace :orders do
  desc "Release one bounded batch (100) of holds expired beyond the five-minute grace period"
  task release_expired: :environment do
    Orders::ReleaseExpired.call
  end
end
