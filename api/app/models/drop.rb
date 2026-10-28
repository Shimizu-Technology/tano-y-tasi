class Drop < ApplicationRecord
  has_one :product, dependent: :restrict_with_exception
  validates :slug, :name, :release_at, presence: true

  def state(now: Time.current)
    return "upcoming" if release_at > now
    return "closed" if closes_at && closes_at <= now
    return "sold_out" if product && product.stock_quantity.zero?
    "live"
  end
end
