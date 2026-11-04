class Product < ApplicationRecord
  INTEGER_MAX = 2_147_483_647
  IMAGE_ROLES = %w[hero gallery detail box lifestyle].freeze

  belongs_to :drop, optional: true
  has_many :order_items, dependent: :restrict_with_exception
  # Public pages always lead with artwork, so a product stays hidden until it has an image.
  scope :shown, -> { where.not(status: "draft").where("jsonb_array_length(products.images) > 0") }
  scope :visible, -> { shown.order(:position, :id) }
  validates :slug, :name, :summary, :description, presence: true
  validates :kind, inclusion: { in: %w[core drop] }
  validates :status, inclusion: { in: %w[draft active archived] }
  validates :stock_quantity, :price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: INTEGER_MAX }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: -INTEGER_MAX, less_than_or_equal_to: INTEGER_MAX }
  validate :placement_consistent, if: -> { will_save_change_to_kind? || will_save_change_to_drop_id? }
  # Only checked when images change, so old data can never block a stock change or checkout.
  validate :images_valid, if: :images_changed?

  def availability(now: Time.current)
    state = if drop && !drop.released?(now: now)
      "upcoming"
    elsif status != "active" || (drop&.closes_at && drop.closes_at <= now)
      "closed"
    elsif stock_quantity.zero?
      "sold_out"
    elsif !StoreSetting.sales_open?
      # The merchant hasn't opened the store, so nothing is for sale yet.
      "coming_soon"
    else
      "available"
    end
    low = stock_quantity <= 20 && state != "coming_soon"
    { state: state, purchasable: state == "available", remaining: low ? stock_quantity : nil, low_stock: low }
  end

  private

  def placement_consistent
    if kind == "drop" && drop_id.nil?
      errors.add(:drop_slug, "must name a drop")
    elsif kind == "core" && drop_id
      errors.add(:drop_slug, "must be empty for the always-available collection")
    elsif drop_id && Product.where(drop_id: drop_id).where.not(id: id).exists?
      errors.add(:drop_slug, AdminCatalog::DROP_TAKEN)
    end
  end

  def images_valid
    return errors.add(:images, "must be a list of images") unless images.is_a?(Array) && images.all?(Hash)
    images.each.with_index(1) do |entry, number|
      image = entry.stringify_keys
      errors.add(:images, "need a role of #{IMAGE_ROLES.to_sentence(last_word_connector: " or ")} (image #{number})") unless IMAGE_ROLES.include?(image["role"])
      errors.add(:images, "need alt text (image #{number})") unless image["alt"].is_a?(String) && image["alt"].strip.present?
      errors.add(:images, "need an aspect like 4:3 (image #{number})") unless image["aspect"].is_a?(String) && image["aspect"].match?(/\A[1-9]\d*:[1-9]\d*\z/)
      errors.add(:images, "need widths as positive whole numbers (image #{number})") unless image["widths"].is_a?(Array) && image["widths"].any? && image["widths"].all? { |width| width.is_a?(Integer) && width.positive? }
      errors.add(:images, "need a base under /images/ or the product bucket (image #{number})") unless ImageStorage.allowed_base?(image["base"])
    end
  end
end
