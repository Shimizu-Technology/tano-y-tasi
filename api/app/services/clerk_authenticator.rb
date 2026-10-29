require "net/http"
require "json"
require "base64"

class ClerkAuthenticator
  JWKS_CACHE_TTL = 1.hour
  UNKNOWN_KID_REFRESH_INTERVAL = 1.minute

  class << self
    def verify(token)
      return nil if token.blank?

      raise ClerkClient::Unavailable, "Clerk issuer or authorized parties are not configured" unless configured?

      header = JWT.decode(token, nil, false).last
      return nil unless header["alg"] == "RS256" && header["kid"].present?

      jwks, from_cache = fetch_jwks
      jwk_data = signing_key(jwks, header.fetch("kid"))
      if jwk_data.nil? && from_cache
        jwks = refresh_jwks_for_unknown_kid(header.fetch("kid"))
        jwk_data = signing_key(jwks, header.fetch("kid"))
      end
      return nil unless jwk_data

      jwk = JWT::JWK.new(jwk_data)
      options = { algorithms: [ "RS256" ], verify_iss: true, iss: issuer,
        required_claims: %w[iss sub exp], verify_expiration: true, verify_not_before: true }
      options.merge!(verify_aud: true, aud: audiences) if audiences.any?
      payload = JWT.decode(token, jwk.public_key, true, options).first
      return nil if payload["sub"].blank?
      # Clerk permits azp to be absent (no frontend Origin was supplied).
      # When present it must match our explicit allowed frontend origins.
      return nil if payload.key?("azp") && !authorized_parties.include?(payload["azp"])

      payload
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
      return [ @cached_jwks, true ] if cached_jwks_valid?

      jwks_mutex.synchronize do
        return [ @cached_jwks, true ] if cached_jwks_valid?

        [ fetch_and_cache_jwks, false ]
      end
    end

    def cached_jwks_valid?
      @cached_url == jwks_url && @cached_jwks.present? && @cached_at.present? && (Time.current - @cached_at) < JWKS_CACHE_TTL
    end

    def refresh_jwks_for_unknown_kid(kid)
      jwks_mutex.synchronize do
        current = cached_jwks_valid? ? @cached_jwks : nil
        return current if signing_key(current, kid)

        now = Time.current
        recently_refreshed = @unknown_kid_refresh_url == jwks_url && @unknown_kid_refreshed_at.present? &&
          (now - @unknown_kid_refreshed_at) < UNKNOWN_KID_REFRESH_INTERVAL
        return current if recently_refreshed

        @unknown_kid_refresh_url = jwks_url
        @unknown_kid_refreshed_at = now
        fetch_and_cache_jwks
      end
    end

    def fetch_and_cache_jwks
      validated = validate_jwks(fetch_jwks_from_clerk)
      @cached_jwks = validated
      @cached_url = jwks_url
      @cached_at = Time.current
      @cached_jwks
    end

    def validate_jwks(response)
      keys = response.is_a?(Hash) && response["keys"].is_a?(Array) ? response["keys"] : []
      usable = keys.filter_map do |data|
        next unless data.is_a?(Hash) && data["kty"] == "RSA" && data["kid"].present?
        next if data["alg"].present? && data["alg"] != "RS256"
        next if data["use"].present? && data["use"] != "sig"

        jwk = JWT::JWK.new(data)
        data if jwk.public_key.is_a?(OpenSSL::PKey::RSA)
      rescue JWT::JWKError, ArgumentError, OpenSSL::PKey::PKeyError
        nil
      end
      raise ClerkClient::Unavailable, "Clerk JWKS has no usable RS256 signing keys" if usable.empty?

      { "keys" => usable }
    end

    def signing_key(jwks, kid)
      jwks&.fetch("keys", [])&.find { |key| key["kid"] == kid }
    end

    def jwks_mutex
      @jwks_mutex ||= Mutex.new
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
        raise ClerkClient::Unavailable, "Clerk JWKS HTTP #{response.code}"
      end
    rescue ClerkClient::Unavailable
      raise
    rescue StandardError => e
      Rails.logger.error("Failed to fetch Clerk JWKS: #{e.message}")
      raise ClerkClient::Unavailable, "Clerk JWKS unavailable"
    end
  end
end
