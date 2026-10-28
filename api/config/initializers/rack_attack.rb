# Process-local by design: no Redis. At scale, enforce a global limit at the edge too.
Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new(size: 16.megabytes)
Rack::Attack.throttle("checkout/ip", limit: 10, period: 1.minute) do |request|
  request.ip if request.post? && request.path.squeeze("/").match?(%r{\A/api/v1/checkout(?:\.[^/]+)?/?\z})
end
Rack::Attack.throttle("subscribers/ip", limit: 5, period: 1.minute) do |request|
  request.ip if request.post? && request.path.squeeze("/").match?(%r{\A/api/v1/subscribers(?:\.[^/]+)?/?\z})
end
Rack::Attack.throttled_responder = lambda do |request|
  retry_after = request.env.fetch("rack.attack.match_data")[:period]
  [ 429, { "content-type" => "application/json", "retry-after" => retry_after.to_s },
    [ { error: { code: "rate_limited", message: "Please wait a moment and try again.", details: {} } }.to_json ] ]
end
Rails.application.config.middleware.use Rack::Attack
