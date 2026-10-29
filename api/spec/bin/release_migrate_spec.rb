require "rails_helper"
require "open3"

RSpec.describe "bin/release-migrate" do
  subject(:run_script) do
    Open3.capture3(environment, Rails.root.join("bin/release-migrate").to_s, chdir: Rails.root.to_s)
  end

  let(:direct_url) { "postgresql://user:password@127.0.0.1:1/tano_y_tasi_production" }
  let(:environment) do
    {
      "RAILS_ENV" => "production",
      "DATABASE_URL" => "postgresql://user:password@127.0.0.1:1/runtime",
      "DATABASE_MIGRATION_URL" => direct_url,
      "EXPECTED_DATABASE_NAME" => "tano_y_tasi_production",
      "PATH" => "#{Dir.home}/.rbenv/shims:#{ENV.fetch('PATH')}",
      "RBENV_VERSION" => ENV["RBENV_VERSION"]
    }
  end

  {
    "DATABASE_MIGRATION_URL is required" => { "DATABASE_MIGRATION_URL" => nil },
    "EXPECTED_DATABASE_NAME is required" => { "EXPECTED_DATABASE_NAME" => nil },
    "must differ from DATABASE_URL" => { "DATABASE_URL" => :direct },
    "must use a direct, non-pooler host" => { "DATABASE_MIGRATION_URL" => "postgresql://user:password@ep-example-pooler.invalid/tano_y_tasi_production" }
  }.each do |message, overrides|
    it "aborts before connecting when #{message}" do
      overrides.each { |key, value| environment[key] = value == :direct ? direct_url : value }

      stdout, stderr, status = run_script

      expect(status).not_to be_success
      expect("#{stdout}\n#{stderr}").to include(message)
      expect("#{stdout}\n#{stderr}").not_to match(/connection refused|could not translate host|ActiveRecord::Connection/i)
    end
  end
end
