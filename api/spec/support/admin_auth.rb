RSpec.shared_context "admin auth" do
  let(:rsa) { OpenSSL::PKey::RSA.generate(2048) }
  let(:jwk) { JWT::JWK.new(rsa) }
  let(:issuer) { "https://tyt.clerk.accounts.dev" }
  let(:admin) { User.create!(clerk_id: "user_admin", email: "admin@example.com", name: "Admin") }
  let(:headers) { { "Authorization" => "Bearer #{session_token(admin.clerk_id)}" } }

  around do |example|
    keys = %w[CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY CLERK_AUTHORIZED_PARTIES CLERK_JWKS_URL ADMIN_EMAILS ADMIN_NOTIFICATION_EMAILS EMAIL_DELIVERY_ENABLED RESEND_API_KEY MAILER_FROM_EMAIL MAILER_REPLY_TO FRONTEND_URL]
    saved = keys.to_h { |key| [ key, ENV[key] ] }
    ENV["CLERK_PUBLISHABLE_KEY"] = "pk_test_#{Base64.strict_encode64('tyt.clerk.accounts.dev$')}"
    ENV["CLERK_SECRET_KEY"] = "test-only-clerk"
    ENV["CLERK_AUTHORIZED_PARTIES"] = "http://localhost:5181"
    ENV["EMAIL_DELIVERY_ENABLED"] = "false"
    ENV["RESEND_API_KEY"] = "test-only-resend"
    ENV["MAILER_FROM_EMAIL"] = "Tåno + Tåsi <orders@example.com>"
    ENV["FRONTEND_URL"] = "http://localhost:5181"
    %w[CLERK_JWKS_URL ADMIN_EMAILS ADMIN_NOTIFICATION_EMAILS MAILER_REPLY_TO].each { |key| ENV.delete(key) }
    example.run
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  before do
    ClerkAuthenticator.instance_variables.each { |name| ClerkAuthenticator.remove_instance_variable(name) }
    stub_request(:get, "#{issuer}/.well-known/jwks.json").to_return(body: { keys: [ jwk.export ] }.to_json)
  end

  def session_token(sub, claims = {}, key: rsa)
    JWT.encode({ sub: sub, iss: issuer, azp: "http://localhost:5181", exp: 1.hour.from_now.to_i, nbf: 1.minute.ago.to_i }.merge(claims.symbolize_keys), key, "RS256", kid: jwk.kid)
  end

  def stub_identity(sub, email: "invited@example.com", verified: true)
    stub_request(:get, "https://api.clerk.com/v1/users/#{sub}").to_return(body: {
      id: sub, first_name: "Test", last_name: "Admin", primary_email_address_id: "primary",
      email_addresses: [ { id: "primary", email_address: email, verification: { status: verified ? "verified" : "unverified" } } ]
    }.to_json)
  end

  def make_order(status: "paid")
    product = create(:product)
    order = Orders::Checkout.call(email: "buyer@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 1 } ]).order
    # Deliberately bypass callbacks for a controlled pre-existing paid fixture.
    order.update_columns(status: status, paid_at: status == "paid" ? Time.current : nil)
    order.reload
  end
end
