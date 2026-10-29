require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe ClerkAuthenticator do
  include_context "admin auth"

  it "verifies a local RSA signature with issuer, expiry, nbf and authorized party" do
    expect(described_class.verify(session_token("user_admin"))).to include("sub" => "user_admin")
    expect(described_class.issuer).to eq(issuer)
  end

  [ { "iss" => "https://attacker.example.com" }, { "azp" => "https://attacker.example.com" }, { "exp" => 1.hour.ago.to_i }, { "nbf" => 1.hour.from_now.to_i }, { "sub" => "" } ].each do |claims|
    it "refuses invalid claims #{claims.keys.join(', ')}" do
      expect(described_class.verify(session_token("user_admin", claims))).to be_nil
    end
  end

  it "refuses bad signatures, malformed tokens, and HS256" do
    expect(described_class.verify(session_token("user_admin", {}, key: OpenSSL::PKey::RSA.generate(2048)))).to be_nil
    expect(described_class.verify("invalid")).to be_nil
    token = JWT.encode({ sub: "user_admin", iss: issuer, exp: 1.hour.from_now.to_i }, "secret", "HS256")
    expect(described_class.verify(token)).to be_nil
  end

  it "accepts absent azp as Clerk does, but requires configured authorized parties" do
    token = JWT.encode({ sub: "user_admin", iss: issuer, exp: 1.hour.from_now.to_i }, rsa, "RS256")
    expect(described_class.verify(token)).to include("sub" => "user_admin")
    ENV.delete("CLERK_AUTHORIZED_PARTIES")
    expect { described_class.verify(token) }.to raise_error(ClerkClient::Unavailable)
  end

  it "caches JWKS for one hour and refreshes after expiry" do
    token = session_token("user_admin")
    2.times { described_class.verify(token) }
    expect(a_request(:get, "#{issuer}/.well-known/jwks.json")).to have_been_made.once
    travel 61.minutes do
      described_class.verify(token)
    end
    expect(a_request(:get, "#{issuer}/.well-known/jwks.json")).to have_been_made.twice
  end

  it "surfaces unavailable JWKS as retryable and supports an HTTPS override" do
    ENV["CLERK_JWKS_URL"] = "https://keys.example.com/jwks"
    stub_request(:get, ENV["CLERK_JWKS_URL"]).to_timeout
    expect { described_class.verify(session_token("user_admin")) }.to raise_error(ClerkClient::Unavailable)
  end

  it "treats a malformed JWKS as an unavailable identity service" do
    stub_request(:get, "#{issuer}/.well-known/jwks.json").to_return(body: { keys: nil }.to_json)
    expect { described_class.verify(session_token("user_admin")) }.to raise_error(ClerkClient::Unavailable)
  end
end
