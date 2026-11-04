# Product photos go straight from the admin's browser to S3 on presigned URLs.
# Configuration is read on use, so a missing bucket never stops the API booting.
class ImageStorage
  CONTENT_TYPE = "image/webp".freeze
  CACHE_CONTROL = "public, max-age=31536000, immutable".freeze
  EXPIRES_IN = 15.minutes.to_i
  MAX_WIDTHS = 6
  WIDTH_RANGE = (100..4000)
  SETTINGS = %w[AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION AWS_S3_BUCKET].freeze
  # Path segments only: no "..", empty segments, queries or spaces (the value ends up in a srcset).
  SAFE_PATH = %r{\A(?:[A-Za-z0-9_-][A-Za-z0-9._-]*/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\z}

  def self.configured?
    SETTINGS.all? { |key| ENV[key].present? }
  end

  def self.public_host
    return unless ENV["AWS_S3_BUCKET"].present? && ENV["AWS_REGION"].present?
    "https://#{ENV["AWS_S3_BUCKET"]}.s3.#{ENV["AWS_REGION"]}.amazonaws.com"
  end

  # An image base is a bundled /images/ path or an object under the bucket's products/ prefix.
  def self.allowed_base?(base)
    return false unless base.is_a?(String)
    prefix = public_host && "#{public_host}/products/"
    path = if base.start_with?("/images/")
      base.delete_prefix("/images/")
    elsif prefix && base.start_with?(prefix)
      base.delete_prefix(prefix)
    end
    path.present? && SAFE_PATH.match?(path)
  end

  def self.presign(product, widths:, content_type:)
    raise ApiError.new("storage_unavailable", "Image uploads aren't set up yet. Ask Leon to check the storage settings.", status: :service_unavailable) unless configured?
    unless content_type == CONTENT_TYPE
      raise ApiError.new("invalid_upload", "Images must be uploaded as WebP.", details: { content_type: [ "must be image/webp" ] })
    end
    unless widths.is_a?(Array) && widths.size.between?(1, MAX_WIDTHS) && widths.all? { |width| width.is_a?(Integer) && WIDTH_RANGE.cover?(width) } && widths.uniq.size == widths.size
      raise ApiError.new("invalid_upload", "Provide 1 to #{MAX_WIDTHS} different widths between #{WIDTH_RANGE.min} and #{WIDTH_RANGE.max}.", details: { widths: [ "must be 1 to #{MAX_WIDTHS} different widths between #{WIDTH_RANGE.min} and #{WIDTH_RANGE.max}" ] })
    end
    require "aws-sdk-s3"
    prefix = "products/#{product.slug}/#{SecureRandom.hex(12)}"
    signer = Aws::S3::Presigner.new(client: client)
    # Cache-Control is left unsigned by default; signing it makes the URL enforce the header.
    uploads = widths.map do |width|
      url, = signer.presigned_request(:put_object, bucket: ENV.fetch("AWS_S3_BUCKET"), key: "#{prefix}-#{width}.webp",
        content_type: CONTENT_TYPE, cache_control: CACHE_CONTROL, expires_in: EXPIRES_IN, whitelist_headers: [ "cache-control" ])
      { width: width, url: url, headers: { "Content-Type" => CONTENT_TYPE, "Cache-Control" => CACHE_CONTROL } }
    end
    { base: "#{public_host}/#{prefix}", uploads: uploads }
  end

  def self.client
    Aws::S3::Client.new(region: ENV.fetch("AWS_REGION"),
      credentials: Aws::Credentials.new(ENV.fetch("AWS_ACCESS_KEY_ID"), ENV.fetch("AWS_SECRET_ACCESS_KEY")))
  end
  private_class_method :client
end
