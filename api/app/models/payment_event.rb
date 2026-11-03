class PaymentEvent < ApplicationRecord
  # Refund and dispute events received before their payment was recorded.
  scope :unresolved, -> { where(processed_at: nil).where.not(payment_intent_id: nil) }
end
