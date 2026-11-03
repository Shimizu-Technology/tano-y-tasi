namespace :emails do
  desc "Retry pending/failed transactional emails, capped at five attempts"
  task retry_failed: :environment do
    EmailDelivery.retryable.find_each(&:deliver!)
  end
end
