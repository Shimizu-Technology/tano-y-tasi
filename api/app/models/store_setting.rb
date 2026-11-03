class StoreSetting < ApplicationRecord
  validates :contact_email, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :tagline, :story, presence: true
  validate do
    unless mission_lines.is_a?(Array) && mission_lines.all? { |line| line.is_a?(String) && line.strip.present? }
      errors.add(:mission_lines, "must be a list of lines")
    end
  end

  def self.current
    Current.store_setting ||= order(:id).first || create_row
  end

  def self.sales_open?
    current.sales_open
  end

  def self.create_row
    create!
  rescue ActiveRecord::RecordNotUnique
    order(:id).first!
  end
  private_class_method :create_row
end
