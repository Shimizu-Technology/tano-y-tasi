class Product < ApplicationRecord
  belongs_to :drop, optional: true
  has_many :order_items, dependent: :restrict_with_exception
  scope :visible, -> { where.not(status: "draft").order(:position, :id) }
  validates :slug, :name, :summary, :description, presence: true
  validates :kind, inclusion: { in: %w[core drop] }
  validates :status, inclusion: { in: %w[draft active archived] }
  validates :stock_quantity, :price_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  def availability(now: Time.current)
    state = if drop && !drop.released?(now: now)
      "upcoming"
    elsif status != "active" || (drop&.closes_at && drop.closes_at <= now)
      "closed"
    elsif stock_quantity.zero?
      "sold_out"
    else
      "available"
    end
    low = stock_quantity <= 20
    { state: state, purchasable: state == "available", remaining: low ? stock_quantity : nil, low_stock: low }
  end
end
