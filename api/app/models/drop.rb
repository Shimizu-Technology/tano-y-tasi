class Drop < ApplicationRecord
  has_one :product, dependent: :restrict_with_exception
  validates :slug, :name, presence: true

  validates :quantity, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :per_customer_limit, numericality: { only_integer: true, greater_than: 0 }
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

  # Quantity stays private until the merchant confirms it.
  def public_quantity
    quantity unless product && Array(product.placeholders).include?("drop.quantity")
  end

  def state(now: Time.current)
    return "upcoming" unless released?(now: now)
    return "closed" if closes_at && closes_at <= now
    return "sold_out" if product && product.stock_quantity.zero?
    "live"
  end
end
