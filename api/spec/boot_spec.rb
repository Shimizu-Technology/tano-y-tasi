require "rails_helper"
require "open3"

RSpec.describe "Boot configuration" do
  def boot(environment, command = [ "runner", "puts 'booted'" ])
    Open3.capture3({ "RAILS_ENV" => "production", "SECRET_KEY_BASE" => "test-only-" * 10,
      "WEB_APP_URL" => "https://shop.example.com", "DATABASE_URL" => "postgres://localhost/tano_y_tasi_development",
      "EXPECTED_DATABASE_NAME" => nil }.merge(environment),
      "bundle", "exec", "rails", *command, chdir: Rails.root.to_s)
  end

  let(:stripe_environment) do
    { "PAYMENT_PROVIDER" => "stripe", "STRIPE_SECRET_KEY" => "sk_test_placeholder", "STRIPE_WEBHOOK_SECRET" => "whsec_test_placeholder" }
  end

  it "refuses simulated payments in production" do
    _out, error, status = boot("PAYMENT_PROVIDER" => "simulated")
    expect(status.success?).to be(false)
    expect(error).to include("PAYMENT_PROVIDER must be stripe in production")
  end

  it "boots Stripe production without contacting Stripe or Postgres" do
    out, error, status = boot(stripe_environment)
    expect(status.success?).to be(true), error
    expect(out).to include("booted")
  end

  it "refuses another project's production database before connecting" do
    _out, error, status = boot(stripe_environment.merge("DATABASE_URL" => "postgres://invalid.invalid/not_this_project"))
    expect(status.success?).to be(false)
    expect(error).to include("Unsafe production database: expected a name starting with tano_y_tasi")
    expect(error).not_to include("PG::ConnectionBad")
  end

  it "requires an explicit production database name to match exactly" do
    _out, error, status = boot(stripe_environment.merge("EXPECTED_DATABASE_NAME" => "tano_y_tasi_production"))
    expect(status.success?).to be(false)
    expect(error).to include("Unsafe production database: expected tano_y_tasi_production")
    out, error, status = boot(stripe_environment.merge("EXPECTED_DATABASE_NAME" => "tano_y_tasi_development"))
    expect(status.success?).to be(true), error
    expect(out).to include("booted")
  end

  it "refuses a missing production database configuration" do
    _out, error, status = boot(stripe_environment.merge("DATABASE_URL" => nil))
    expect(status.success?).to be(false)
    expect(error).to include("Unsafe production database")
  end

  it "allows an explicitly named production database outside the default prefix without connecting" do
    out, error, status = boot(stripe_environment.merge("DATABASE_URL" => "postgres://invalid.invalid/merchant_puzzles",
      "EXPECTED_DATABASE_NAME" => "merchant_puzzles"))
    expect(status.success?).to be(true), error
    expect(out).to include("booted")
  end

  it "guards db:migrate before its database task can connect" do
    # Confirm the only real database target first. The production subprocess uses
    # that same database name, an unreachable socket, and a mismatched allowlist;
    # its initializer must reject the configuration before any migration runs.
    out, error, status = Open3.capture3({ "RAILS_ENV" => "test", "PAYMENT_PROVIDER" => "simulated" },
      "bin/rails", "runner", "puts ActiveRecord::Base.connection.current_database", chdir: Rails.root.to_s)
    expect(status.success?).to be(true), error
    expect(out.strip).to eq("tano_y_tasi_test")
    _out, error, status = boot(stripe_environment.merge(
      "DATABASE_URL" => "postgresql:///tano_y_tasi_test?host=/nonexistent-tano-y-tasi-socket",
      "EXPECTED_DATABASE_NAME" => "tano_y_tasi_production"), [ "db:migrate" ])
    expect(status.success?).to be(false)
    expect(error).to include("Unsafe production database: expected tano_y_tasi_production")
    expect(error).not_to include("PG::ConnectionBad")
  end

  it "refuses a database URL belonging to another project" do
    _out, error, status = boot("RAILS_ENV" => "test", "PAYMENT_PROVIDER" => "simulated", "DATABASE_URL" => "postgres://localhost/not_this_project")
    expect(status.success?).to be(false)
    expect(error).to include("Unsafe DATABASE_URL: expected tano_y_tasi_test")
  end
end
