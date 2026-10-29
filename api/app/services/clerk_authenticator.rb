require "net/http"
require "json"
require "base64"

class ClerkAuthenticator
  JWKS_CACHE_TTL = 1.hour

  class << self
    def verify(token)
      return nil if token.blank?

      raise ClerkClient::Unavailable, "Clerk issuer or authorized parties are not configured" unless configured?

      jwks = fetch_jwks
      raise ClerkClient::Unavailable, "Clerk JWKS unavailable" if jwks.nil?

      # Try each key until one works (Clerk may rotate keys)
      jwks["keys"].each do |jwk_data|
        begin
          jwk = JWT::JWK.new(jwk_data)
          options = { algorithms: [ "RS256" ], verify_iss: true, iss: issuer,
            required_claims: %w[iss sub exp], verify_expiration: true, verify_not_before: true }
          options.merge!(verify_aud: true, aud: audiences) if audiences.any?
          payload = JWT.decode(token, jwk.public_key, true, options).first
          next if payload["sub"].blank?
          # Clerk permits azp to be absent (no frontend Origin was supplied).
          # When present it must match our explicit allowed frontend origins.
          next if payload.key?("azp") && !authorized_parties.include?(payload["azp"])

          return payload
        rescue JWT::DecodeError
          next
        end
      end

      nil # No key could verify the token
    rescue ClerkClient::Unavailable
      raise
    rescue JWT::DecodeError, ArgumentError
      nil
    end

    def issuer
      key = ENV["CLERK_PUBLISHABLE_KEY"].to_s
      return nil unless key.match?(/\Apk_(?:test|live)_/)

      encoded = key.split("_", 3).last
      encoded += "=" * ((4 - encoded.length % 4) % 4)
      domain = Base64.strict_decode64(encoded).delete_suffix("$")
      return nil unless domain.match?(/\A[a-zA-Z0-9.-]+\z/)

      "https://#{domain}"
    rescue ArgumentError
      nil
    end

    def authorized_parties
      configured = ENV["CLERK_AUTHORIZED_PARTIES"].presence
      configured.to_s.split(",").map { |origin| origin.strip.delete_suffix("/") }.reject(&:empty?)
    end

    def configured?
      valid_origin?(issuer, https_only: true) && authorized_parties.any? &&
        authorized_parties.all? { |origin| valid_origin?(origin, https_only: Rails.env.production?) } &&
        jwks_url.present? && ENV["CLERK_SECRET_KEY"].present?
    end

    private

    def audiences
      ENV["CLERK_AUDIENCE"].to_s.split(",").map(&:strip).reject(&:empty?)
    end

    def valid_origin?(value, https_only:)
      uri = URI.parse(value.to_s)
      schemes = https_only ? [ "https" ] : %w[http https]
      schemes.include?(uri.scheme) && uri.host.present? && uri.userinfo.nil? &&
        uri.path.empty? && uri.query.nil? && uri.fragment.nil?
    rescue URI::InvalidURIError
      false
    end

    def jwks_url
      value = ENV["CLERK_JWKS_URL"].presence || ("#{issuer}/.well-known/jwks.json" if issuer.present?)
      uri = URI.parse(value.to_s)
      value if uri.scheme == "https" && uri.host.present? && uri.userinfo.nil? && uri.fragment.nil?
    rescue URI::InvalidURIError
      nil
    end

    def fetch_jwks
      if cached_jwks_valid?
        @cached_jwks
      else
        response = fetch_jwks_from_clerk
        return nil unless response

        unless response.is_a?(Hash) && response["keys"].is_a?(Array) && response["keys"].any?
          raise ClerkClient::Unavailable, "Clerk JWKS has no signing keys"
        end

        @cached_jwks = response
        @cached_url = jwks_url
        @cached_at = Time.current
        @cached_jwks
      end
    end

    def cached_jwks_valid?
      @cached_url == jwks_url && @cached_jwks.present? && @cached_at.present? && (Time.current - @cached_at) < JWKS_CACHE_TTL
    end

    def fetch_jwks_from_clerk
      uri = URI.parse(jwks_url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.verify_mode = OpenSSL::SSL::VERIFY_PEER
      http.open_timeout = 5
      http.read_timeout = 5

      request = Net::HTTP::Get.new(uri.request_uri)
      response = http.request(request)

      if response.code == "200"
        JSON.parse(response.body)
      else
        Rails.logger.error("Failed to fetch Clerk JWKS: HTTP #{response.code}")
        nil
      end
    rescue StandardError => e
      Rails.logger.error("Failed to fetch Clerk JWKS: #{e.message}")
      nil
    end
  end
end
