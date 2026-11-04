require "net/http"

module Shipping
  # A thin JSON client for EasyPost's v2 API. Quotes use short timeouts, so a slow
  # carrier falls back to flat rates instead of holding up checkout or a Puma thread.
  # Call outside any transaction or row lock.
  class EasyPostClient
    class Error < StandardError
      attr_reader :status, :code

      def initialize(message, status: nil, code: nil)
        super(message)
        @status = status
        @code = code
      end

      def definitive?
        status.to_i.between?(400, 499)
      end
    end

    BASE = URI("https://api.easypost.com/v2/").freeze
    QUOTE_TIMEOUT = { open_timeout: 3, read_timeout: 8 }.freeze
    # Buying is slower, and an unclear answer is recovered by reading the shipment back.
    LABEL_TIMEOUT = { open_timeout: 5, read_timeout: 30 }.freeze

    def self.configured?
      ENV["EASYPOST_API_KEY"].present?
    end

    def initialize(timeouts: QUOTE_TIMEOUT)
      @timeouts = timeouts
    end

    def get(path)
      request(Net::HTTP::Get.new(BASE + path))
    end

    def post(path, body = {})
      message = Net::HTTP::Post.new(BASE + path)
      message["Content-Type"] = "application/json"
      message.body = body.to_json
      request(message)
    end

    private

    def request(message)
      message.basic_auth(ENV.fetch("EASYPOST_API_KEY"), "")
      message["Accept"] = "application/json"
      response = Net::HTTP.start(BASE.host, BASE.port, use_ssl: true, **@timeouts) { |http| http.request(message) }
      data = JSON.parse(response.body.presence || "{}")
      return data if response.is_a?(Net::HTTPSuccess)
      failure = data.is_a?(Hash) && data["error"].is_a?(Hash) ? data["error"] : {}
      raise Error.new(failure["message"].presence || "EasyPost answered #{response.code}", status: response.code.to_i, code: failure["code"])
    rescue JSON::ParserError, SocketError, IOError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError => error
      raise Error.new("EasyPost could not be reached (#{error.class})")
    end
  end
end
