class Order < ApplicationRecord
  has_many :order_items, dependent: :restrict_with_exception
  has_many :email_deliveries, dependent: :delete_all
  has_many :refund_requests, dependent: :restrict_with_exception
  after_update :notify_paid, if: -> { saved_change_to_status? && status == "paid" }
  validates :tracking_url, format: { with: /\Ahttps?:\/\/[^\s]+\z/i }, allow_blank: true

  def notify_paid
    Emails::Notifications.paid(self)
  end

  has_secure_token :token, length: 40
  normalizes :email, with: ->(value) { value.strip.downcase }
  before_validation { self.customer_key = self.class.customer_key_for(email) }
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }
  scope :holding, -> { where(status: "pending_payment") }

  # What the customer actually paid, which a flagged payment may not match to the order.
  def paid_cents
    charged_cents || total_cents
  end

  # What the customer pays: tax comes from Stripe, on top of the order's total.
  def grand_total_cents
    total_cents + tax_cents
  end

  # Per-customer limits treat Gmail dot variants and +tags as one person.
  def self.customer_key_for(email)
    local, domain = email.to_s.strip.downcase.split("@", 2)
    return email.to_s.strip.downcase if domain.blank?
    local = local.split("+", 2).first.to_s
    if %w[gmail.com googlemail.com].include?(domain)
      local = local.delete(".")
      domain = "gmail.com"
    end
    "#{local}@#{domain}"
  end
end
