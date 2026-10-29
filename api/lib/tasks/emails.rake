namespace :emails do
  desc "Retry pending/failed transactional emails, capped at five attempts"
  task retry_failed: :environment do
    EmailDelivery.where(status: %w[pending failed]).where("attempts < ?", 5).find_each(&:deliver!)
  end
end
