class Order < ApplicationRecord
  has_many :order_items, dependent: :restrict_with_exception
  has_secure_token :token, length: 40
  normalizes :email, with: ->(value) { value.strip.downcase }
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }
  scope :holding, -> { where(status: "pending_payment") }
end
