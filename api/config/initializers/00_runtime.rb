provider = ENV.fetch("PAYMENT_PROVIDER", Rails.env.production? ? "" : "simulated")
raise "PAYMENT_PROVIDER must be stripe in production" if Rails.env.production? && provider != "stripe"
raise "Unknown PAYMENT_PROVIDER" unless %w[stripe simulated].include?(provider)
# Resolve Rails' effective configuration without opening a connection. This also
# runs through the :environment prerequisite of db:migrate and other rake tasks.
database = ActiveRecord::Base.connection_db_config.database.to_s
expected = { "development" => "tano_y_tasi_development", "test" => "tano_y_tasi_test" }[Rails.env]
if Rails.env.production?
  expected = ENV["EXPECTED_DATABASE_NAME"].presence
  allowed = expected ? database == expected : database.start_with?("tano_y_tasi")
  raise "Unsafe production database: expected #{expected || 'a name starting with tano_y_tasi'}" unless allowed
elsif expected && database != expected
  raise "Unsafe DATABASE_URL: expected #{expected}"
end
Rails.application.config.x.payment_provider = provider
origins = ENV.fetch("WEB_APP_URL", Rails.env.production? ? "" : "http://localhost:5181").split(",").map(&:strip)
raise "WEB_APP_URL is required" if origins.empty? || origins.any?(&:blank?)
origins.each do |origin|
  uri = URI.parse(origin)
  raise "WEB_APP_URL must contain HTTP(S) origins" unless %w[http https].include?(uri.scheme) && uri.host && [ "", "/" ].include?(uri.path) && !uri.query && !uri.fragment && !uri.userinfo
  raise "Production WEB_APP_URL must use HTTPS" if Rails.env.production? && uri.scheme != "https"
end
Rails.application.config.x.web_origins = origins.map { |origin| origin.delete_suffix("/") }
if provider == "stripe"
  %w[STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET].each do |key|
    raise "#{key} is required for Stripe" if ENV[key].blank?
  end
  Stripe.api_key = ENV.fetch("STRIPE_SECRET_KEY")
  # Three attempts must fit well inside ProviderLease::TTL.
  Stripe.max_network_retries = 2
  Stripe.open_timeout = 10
  Stripe.read_timeout = 30
end
Rails.application.config.hosts = [ "localhost", "127.0.0.1", "[::1]" ] + ENV.fetch("API_HOSTS", "").split(",").map(&:strip).reject(&:blank?)
Rails.application.config.hosts << "www.example.com" if Rails.env.test?
Rails.application.config.lograge.enabled = true

# Order URLs carry bearer tokens; parameter filtering alone does not redact paths.
Rails.application.config.lograge.before_format = lambda do |data, _payload|
  data[:path] = data[:path]&.gsub(%r{(/api/v1/(?:orders|simulated_payments)/)[^/?]+}, '\\1[FILTERED]')
  data
end
