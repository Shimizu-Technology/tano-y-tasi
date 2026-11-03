class RefundRequest < ApplicationRecord
  belongs_to :order
  before_validation(on: :create) { self.idempotency_key ||= SecureRandom.uuid }
  validates :amount_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :status, inclusion: { in: %w[open completed rejected] }
  scope :open, -> { where(status: "open") }
end
