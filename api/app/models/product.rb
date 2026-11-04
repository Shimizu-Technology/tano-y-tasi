class Product < ApplicationRecord
  INTEGER_MAX = 2_147_483_647
  IMAGE_ROLES = %w[hero gallery detail box lifestyle].freeze
  PREORDER_SHIPS_MAX = 120

  belongs_to :drop, optional: true
  has_many :order_items, dependent: :restrict_with_exception
  has_many :production_runs, dependent: :restrict_with_exception
  # Public pages always lead with artwork, so a product stays hidden until it has an image.
  scope :shown, -> { where.not(status: "draft").where("jsonb_array_length(products.images) > 0") }
  # Signature products lead every public list; position orders the rest.
  scope :visible, -> { shown.order(signature: :desc, position: :asc, id: :asc) }
  normalizes :preorder_ships, with: ->(value) { value.strip.presence }
  validates :slug, :name, :summary, :description, presence: true
  validates :kind, inclusion: { in: %w[core drop] }
  validates :status, inclusion: { in: %w[draft active archived] }
  validates :stock_quantity, :price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: INTEGER_MAX }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: -INTEGER_MAX, less_than_or_equal_to: INTEGER_MAX }
  validates :per_customer_limit, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: INTEGER_MAX }, allow_nil: true
  validates :weight_oz, numericality: { greater_than: 0, less_than: 100_000 }, allow_nil: true
  validates :length_in, :width_in, :height_in, numericality: { greater_than: 0, less_than: 1000 }, allow_nil: true
  validates :signature, :preorder, inclusion: { in: [ true, false ], message: "must be true or false" }
  validates :preorder_ships, length: { maximum: PREORDER_SHIPS_MAX }
  validate :preorder_says_when_it_ships, if: -> { preorder_changed? || preorder_ships_changed? }
  validate :placement_consistent, if: -> { will_save_change_to_kind? || will_save_change_to_drop_id? }
  # Only checked when images change, so old data can never block a stock change or checkout.
  validate :images_valid, if: :images_changed?

  # Mirrors the shown scope for products already in memory.
  def shown?
    status != "draft" && images.present?
  end

  def on_sale?
    status == "active" && images.present?
  end

  # A product's own limit wins. Otherwise it follows its drop, and core products have none.
  def effective_limit
    per_customer_limit || drop&.per_customer_limit
  end

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
    elsif preorder
      "preorder"
    else
      "available"
    end
    low = stock_quantity <= 20 && state != "coming_soon"
    { state: state, purchasable: %w[available preorder].include?(state), remaining: low ? stock_quantity : nil, low_stock: low }
  end

  private

  def placement_consistent
    if kind == "drop" && drop_id.nil?
      errors.add(:drop_slug, "must name a drop")
    elsif kind == "core" && drop_id
      errors.add(:drop_slug, "must be empty for the always-available collection")
    end
  end

  def preorder_says_when_it_ships
    errors.add(:preorder_ships, "must say when it ships") if preorder && preorder_ships.blank?
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
