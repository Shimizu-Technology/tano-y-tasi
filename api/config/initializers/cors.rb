Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*Rails.application.config.x.web_origins)
    resource "/api/*", headers: :any, methods: %i[get post options], credentials: false
  end
end
