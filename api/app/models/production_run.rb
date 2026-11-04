class ProductionRun < ApplicationRecord
  STATUSES = %w[ordered received canceled].freeze

  belongs_to :product
  has_one :inventory_movement, dependent: :restrict_with_exception
  validates :status, inclusion: { in: STATUSES }
  validates :quantity, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: Product::INTEGER_MAX }
  validates :unit_cost_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: Product::INTEGER_MAX }, allow_nil: true
  validates :supplier, length: { maximum: 200 }
  validates :notes, length: { maximum: 5000 }
  normalizes :supplier, with: ->(value) { value.strip.presence }
  validate do
    # A date Rails can't read is cast to nil. It must not quietly clear the expected date.
    errors.add(:expected_at, "isn't a valid date") if expected_at.nil? && expected_at_before_type_cast.present?
    errors.add(:quantity, "can't change once a run is received") if quantity_changed? && status_was == "received"
  end
end
