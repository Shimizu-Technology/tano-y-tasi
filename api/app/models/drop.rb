class Drop < ApplicationRecord
  has_one :product, dependent: :restrict_with_exception
  validates :slug, :name, presence: true

  validates :quantity, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: Product::INTEGER_MAX }
  validates :per_customer_limit, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: Product::INTEGER_MAX }
  validate do
    errors.add(:release_at, "must not be after closes_at") if release_at && closes_at && release_at > closes_at
  end

  # Without a release date the drop is announced as "coming soon": visible, never purchasable.
  def announced?
    release_at.present?
  end

  def released?(now: Time.current)
    announced? && release_at <= now
  end

  # A date that passed while the store was closed means nothing to a customer.
  def public_release_at
    release_at unless released? && state == "upcoming"
  end

  # Quantity stays private until the merchant confirms it. Zero means it isn't decided yet.
  def public_quantity
    quantity unless quantity.zero? || (product && Array(product.placeholders).include?("drop.quantity"))
  end

  def state(now: Time.current)
    return "upcoming" unless released?(now: now)
    return "closed" if closes_at && closes_at <= now
    return "sold_out" if product && product.stock_quantity.zero?
    # A drop can't be live until the merchant opens the store and attaches a product.
    return "upcoming" unless product && StoreSetting.sales_open?
    "live"
  end
end
