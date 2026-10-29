class Order < ApplicationRecord
  has_many :order_items, dependent: :restrict_with_exception
  has_many :email_deliveries, dependent: :delete_all
  after_update :notify_paid, if: -> { saved_change_to_status? && status == "paid" }
  validates :tracking_url, format: { with: /\Ahttps?:\/\/[^\s]+\z/i }, allow_blank: true

  def notify_paid
    Emails::Notifications.paid(self)
  end

  has_secure_token :token, length: 40
  normalizes :email, with: ->(value) { value.strip.downcase }
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }
  scope :holding, -> { where(status: "pending_payment") }
end
