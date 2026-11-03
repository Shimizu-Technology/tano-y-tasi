class Page < ApplicationRecord
  SLUGS = %w[shipping returns privacy terms].freeze
  validates :slug, inclusion: { in: SLUGS }, uniqueness: true
  validates :title, :body, presence: true

  # Policies mention the contact email, which can change without editing each page.
  def rendered_body
    body.gsub("{{contact_email}}", StoreSetting.current.contact_email)
  end
end
