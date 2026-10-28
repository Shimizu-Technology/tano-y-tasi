class Subscriber < ApplicationRecord
  normalizes :email, with: ->(value) { value.strip.downcase }
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, length: { maximum: 254 }
  validates :source, inclusion: { in: %w[home drop product footer] }, allow_nil: true
  validates :drop_slug, length: { maximum: 200 }, allow_nil: true
end
