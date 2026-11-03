ENV["RAILS_ENV"] = "test"
ENV["PAYMENT_PROVIDER"] = "simulated"
require_relative "../config/environment"
abort("Production mode!") if Rails.env.production?
require "rspec/rails"
require "webmock/rspec"
require "spec_helper"
WebMock.disable_net_connect!(allow_localhost: false)
# Never auto-load a schema or prepare databases from specs.
name = ActiveRecord::Base.connection.current_database
abort("Unsafe test database: #{name}") unless name == "tano_y_tasi_test"
abort("Run guarded test db:migrate first") if ActiveRecord::Base.connection_pool.migration_context.needs_migration?
RSpec.configure do |config|
  config.fixture_paths = [ Rails.root.join("spec/fixtures") ]
  config.use_transactional_fixtures = true
  config.include FactoryBot::Syntax::Methods
  config.include ActiveSupport::Testing::TimeHelpers
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!
  config.before do
    Rack::Attack.reset!
    allow(Rails.application.config.x).to receive(:payment_provider).and_return("simulated")
    allow(StoreSetting).to receive(:sales_open?).and_return(true)
  end
  config.after { Current.reset }
end
