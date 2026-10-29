require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Admin provisioning", type: :request do
  include_context "admin auth"
  let(:signin_headers) { { "Authorization" => "Bearer #{session_token('new_user')}" } }

  it "bootstraps a verified primary email from the normalized allowlist" do
    ENV["ADMIN_EMAILS"] = " INVITED@EXAMPLE.COM ,another@example.com"
    stub_identity("new_user", email: " INVITED@example.com ")
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:ok)
    expect(User.find_by!(clerk_id: "new_user")).to have_attributes(email: "invited@example.com", name: "Test Admin")
    expect(User.find_by!(clerk_id: "new_user").last_signed_in_at).to be_present
  end

  it "accepts a pending invitation on first sign-in" do
    invitation = AdminInvitation.create!(email: "invited@example.com")
    stub_identity("new_user")
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:ok)
    expect(invitation.reload.accepted_at).to be_present
  end

  it "refuses unverified primary email even when the allowlist matches" do
    ENV["ADMIN_EMAILS"] = "invited@example.com"
    stub_identity("new_user", verified: false)
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:forbidden)
    expect(User.where(clerk_id: "new_user")).not_to exist
  end

  it "does not use a verified secondary email instead of the primary" do
    ENV["ADMIN_EMAILS"] = "invited@example.com"
    stub_request(:get, "https://api.clerk.com/v1/users/new_user").to_return(body: { id: "new_user", primary_email_address_id: "primary", email_addresses: [
      { id: "primary", email_address: "other@example.com", verification: { status: "unverified" } },
      { id: "secondary", email_address: "invited@example.com", verification: { status: "verified" } }
    ] }.to_json)
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:forbidden)
  end

  it "refuses revoked and accepted invitations" do
    stub_identity("new_user")
    invitation = AdminInvitation.create!(email: "invited@example.com", revoked_at: Time.current)
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:forbidden)
    invitation.update!(revoked_at: nil, accepted_at: Time.current)
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:forbidden)
  end

  it "returns 503 when Clerk identity lookup times out" do
    stub_request(:get, "https://api.clerk.com/v1/users/new_user").to_timeout
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:service_unavailable)
    expect(response.parsed_body.dig("error", "code")).to eq("identity_unavailable")
  end

  it "returns 503 for invalid identity data and missing Backend API config" do
    stub_request(:get, "https://api.clerk.com/v1/users/new_user").to_return(body: { id: "someone_else", email_addresses: [] }.to_json)
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:service_unavailable)
    ENV.delete("CLERK_SECRET_KEY")
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:service_unavailable)
  end

  it "fails closed for an existing admin when the Backend API credential is missing" do
    admin
    ENV.delete("CLERK_SECRET_KEY")
    get "/api/v1/admin/me", headers: headers
    expect(response).to have_http_status(:service_unavailable)
    expect(response.parsed_body.dig("error", "code")).to eq("identity_unavailable")
  end

  it "keeps inactive admins forbidden even if allowlisted" do
    admin.update!(active: false)
    ENV["ADMIN_EMAILS"] = admin.email
    get "/api/v1/admin/me", headers: headers
    expect(response).to have_http_status(:forbidden)
    expect(a_request(:get, "https://api.clerk.com/v1/users/#{admin.clerk_id}")).not_to have_been_made
  end

  it "does not recreate an inactive admin under a different Clerk ID" do
    User.create!(clerk_id: "old_clerk_id", email: "invited@example.com", active: false)
    ENV["ADMIN_EMAILS"] = "invited@example.com"
    stub_identity("new_user")

    get "/api/v1/admin/me", headers: signin_headers

    expect(response).to have_http_status(:forbidden)
    expect(User.where(email: "invited@example.com").pluck(:clerk_id, :active)).to eq([ [ "old_clerk_id", false ] ])
  end

  it "does not silently relink an active email to a different Clerk ID" do
    User.create!(clerk_id: "old_clerk_id", email: "invited@example.com")
    ENV["ADMIN_EMAILS"] = "invited@example.com"
    stub_identity("new_user")
    expect(Rails.logger).to receive(:warn).with(/ADMIN_PROVISIONING_EMAIL_CONFLICT.*existing_clerk_id=old_clerk_id.*attempted_clerk_id=new_user/)

    get "/api/v1/admin/me", headers: signin_headers

    expect(response).to have_http_status(:forbidden)
    expect(User.where(email: "invited@example.com").pluck(:clerk_id)).to eq([ "old_clerk_id" ])
  end

  it "finds the canonical clerk_id after a uniqueness race" do
    ENV["ADMIN_EMAILS"] = "invited@example.com"
    stub_identity("new_user")
    canonical = User.create!(clerk_id: "new_user", email: "invited@example.com")
    allow(User).to receive(:find_by).with(clerk_id: "new_user").and_return(nil, canonical)
    allow(User).to receive(:create!).and_raise(ActiveRecord::RecordNotUnique)
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig("user", "id")).to eq(canonical.id)
  end

  it "fails closed on missing Clerk config while the storefront remains available" do
    ENV.delete("CLERK_PUBLISHABLE_KEY")
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:service_unavailable)
    get "/api/v1/storefront"
    expect(response).to have_http_status(:ok)
    ENV["CLERK_PUBLISHABLE_KEY"] = "pk_test_#{Base64.strict_encode64('tyt.clerk.accounts.dev$')}"
    ENV["CLERK_AUTHORIZED_PARTIES"] = ""
    get "/api/v1/admin/me", headers: signin_headers
    expect(response).to have_http_status(:service_unavailable)
  end
end
