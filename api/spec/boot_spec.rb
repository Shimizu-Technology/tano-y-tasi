require "rails_helper"
require "open3"

RSpec.describe "Boot configuration" do
  def boot(environment)
    Open3.capture3({ "RAILS_ENV" => "production", "SECRET_KEY_BASE" => "test-only-" * 10,
      "WEB_APP_URL" => "https://shop.example.com", "DATABASE_URL" => nil }.merge(environment),
      "bundle", "exec", "rails", "runner", "puts 'booted'", chdir: Rails.root.to_s)
  end

  it "refuses simulated payments in production" do
    _out, error, status = boot("PAYMENT_PROVIDER" => "simulated")
    expect(status.success?).to be(false)
    expect(error).to include("PAYMENT_PROVIDER must be stripe in production")
  end

  it "boots Stripe production without contacting Stripe or Postgres" do
    out, error, status = boot("PAYMENT_PROVIDER" => "stripe", "STRIPE_SECRET_KEY" => "sk_test_placeholder", "STRIPE_WEBHOOK_SECRET" => "whsec_test_placeholder")
    expect(status.success?).to be(true), error
    expect(out).to include("booted")
  end

  it "refuses a database URL belonging to another project" do
    _out, error, status = boot("RAILS_ENV" => "test", "PAYMENT_PROVIDER" => "simulated", "DATABASE_URL" => "postgres://localhost/not_this_project")
    expect(status.success?).to be(false)
    expect(error).to include("Unsafe DATABASE_URL: expected tano_y_tasi_test")
  end
end
