# Creating catalog records. Slugs and drop numbers are chosen optimistically and the
# unique indexes decide any race, so no lock is held and the Neon pooler stays safe.
class AdminCatalog
  ATTEMPTS = 10
  SLUG_LENGTH = 80
  # /admin/products/new is the create screen, so no product can own that slug.
  RESERVED_SLUGS = %w[new].freeze
  IMAGE_KEYS = %w[role alt base widths aspect].freeze
  DROP_TAKEN = "already has a product".freeze

  def self.create_product(attributes)
    attributes = attributes.with_defaults(status: "draft", position: Product.maximum(:position).to_i + 1)
    base = attributes[:name].to_s.parameterize.first(SLUG_LENGTH).delete_suffix("-").presence || "product"
    unique do
      Product.create!(attributes.merge(slug: available_slug(base)))
    end
  end

  def self.create_drop(attributes)
    attributes = attributes.with_defaults(quantity: 0)
    unique do
      number = Drop.maximum(:number).to_i + 1
      name = attributes[:name].to_s.parameterize.first(SLUG_LENGTH).delete_suffix("-")
      Drop.create!(attributes.merge(number: number, slug: [ format("drop-%03d", number), name.presence ].compact.join("-")))
    end
  end

  # Turns kind + drop_slug into model attributes. Saving enforces one product per drop.
  def self.placement(kind, drop_slug, product: nil)
    kind = drop_slug.present? ? "drop" : (product&.kind || "core") if kind.blank?
    case kind
    when "core"
      invalid!(:drop_slug, "must be empty for the always-available collection") if drop_slug.present?
      { kind: "core", drop: nil }
    when "drop"
      drop = drop_slug.present? ? (Drop.find_by(slug: drop_slug.to_s) || invalid!(:drop_slug, "doesn't match a drop")) : product&.drop
      invalid!(:drop_slug, "must name a drop") unless drop
      { kind: "drop", drop: drop }
    else
      invalid!(:kind, "must be core or drop")
    end
  end

  def self.update_product(product, attributes)
    product.transaction do
      product.update!(attributes)
      # The drop's sold-out date has to describe the product it holds now.
      Orders::Inventory.refresh_drop!(product) if product.saved_change_to_drop_id?
    end
  rescue ActiveRecord::RecordNotUnique
    invalid!(:drop_slug, DROP_TAKEN)
  end

  # Keeps only image fields. Shape problems are reported here; each image's rules live on Product.
  def self.images(raw)
    invalid!(:images, "must be a list of images") unless raw.is_a?(Array) && raw.all?(Hash)
    raw.map { |image| image.slice(*IMAGE_KEYS).then { |kept| kept["alt"].is_a?(String) ? kept.merge("alt" => kept["alt"].strip) : kept } }
  end

  # An unreadable date must not quietly become "coming soon".
  def self.check_times!(attributes)
    %i[release_at closes_at].each do |key|
      value = attributes[key]
      next if value.blank?
      parsed = begin
        value.is_a?(String) && Time.zone.parse(value)
      rescue ArgumentError
        nil
      end
      invalid!(key, "isn't a valid date and time") unless parsed
    end
  end

  def self.invalid!(field, message)
    raise ApiError.new("invalid_record", "#{field.to_s.humanize} #{message}", details: { field => [ message ] })
  end

  def self.unique
    attempts = 0
    begin
      # A savepoint keeps a lost race from poisoning any surrounding transaction.
      ApplicationRecord.transaction(requires_new: true) { yield }
    rescue ActiveRecord::RecordNotUnique => error
      invalid!(:drop_slug, DROP_TAKEN) if error.message.include?("one_product_per_drop")
      retry if (attempts += 1) < ATTEMPTS
      raise ApiError.new("busy", "Another save is still running. Try again in a moment.", status: :conflict)
    end
  end
  private_class_method :unique

  def self.available_slug(base)
    taken = Product.where("slug = :base OR slug LIKE :family", base: base, family: "#{Product.sanitize_sql_like(base)}-%").pluck(:slug) + RESERVED_SLUGS
    return base unless taken.include?(base)
    (2..).lazy.map { |suffix| "#{base}-#{suffix}" }.find { |slug| taken.exclude?(slug) }
  end
  private_class_method :available_slug
end
