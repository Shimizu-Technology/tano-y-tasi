require "net/http"

class ClerkClient
  class Unavailable < StandardError; end

  def self.request(method, path, body = nil)
    raise Unavailable, "CLERK_SECRET_KEY is missing" if ENV["CLERK_SECRET_KEY"].blank?
    uri = URI("https://api.clerk.com/v1/#{path}")
    request = (method == :get ? Net::HTTP::Get : Net::HTTP::Post).new(uri)
    request["Authorization"] = "Bearer #{ENV.fetch('CLERK_SECRET_KEY')}"
    request["Content-Type"] = "application/json"
    request.body = body.to_json if body
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 3, read_timeout: 5, write_timeout: 5) { |http| http.request(request) }
    raise Unavailable, "Clerk HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  rescue Unavailable
    raise
  rescue StandardError => error
    raise Unavailable, "Clerk request failed (#{error.class})"
  end
end
