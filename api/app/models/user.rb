class User < ApplicationRecord
  normalizes :email, with: ->(value) { value.strip.downcase }
  validates :clerk_id, presence: true
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: [ "admin" ] }
  scope :admins, -> { where(role: "admin", active: true) }
end
