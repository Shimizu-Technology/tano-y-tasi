class AdminInvitation < ApplicationRecord
  belongs_to :invited_by, class_name: "User", optional: true
  normalizes :email, with: ->(value) { value.strip.downcase }
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, length: { maximum: 254 }
  scope :pending, -> { where(accepted_at: nil, revoked_at: nil) }
end
