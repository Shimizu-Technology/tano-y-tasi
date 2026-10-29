require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Admin API", type: :request do
  include_context "admin auth"
  let!(:order) { make_order }
  let!(:product) { order.order_items.first.product }
  let!(:drop) { create(:drop) }
  let!(:other_admin) { User.create!(clerk_id: "user_other", email: "other@example.com") }
  let!(:invitation) { AdminInvitation.create!(email: "pending@example.com", clerk_invitation_id: "inv_pending") }
  let!(:delivery) { EmailDelivery.create!(order: order, kind: "order_confirmation", to: order.email, subject: "Confirmation") }

  before do
    stub_request(:post, "https://api.clerk.com/v1/invitations").to_return(body: { id: "inv_new" }.to_json)
    stub_request(:post, "https://api.clerk.com/v1/invitations/inv_pending/revoke").to_return(body: { id: "inv_pending" }.to_json)
  end

  endpoints = [
    [ :get, "/me", {} ], [ :get, "/dashboard", {} ], [ :get, "/orders", {} ],
    [ :get, "/orders/ORDER", {} ], [ :patch, "/orders/ORDER", { notes: "Pack carefully" } ],
    [ :post, "/orders/ORDER/fulfill", { notify: true } ], [ :post, "/orders/ORDER/unfulfill", {} ],
    [ :post, "/orders/ORDER/email_deliveries/DELIVERY/resend", {} ],
    [ :get, "/products", {} ], [ :get, "/products/PRODUCT", {} ],
    [ :patch, "/products/PRODUCT", { summary: "Updated summary" } ],
    [ :post, "/products/PRODUCT/stock_adjustments", { delta: 2, reason: "Restock" } ],
    [ :get, "/products/PRODUCT/inventory_movements", {} ],
    [ :get, "/drops", {} ], [ :get, "/drops/DROP", {} ], [ :patch, "/drops/DROP", { name: "Updated drop" } ],
    [ :get, "/subscribers", {} ], [ :get, "/subscribers.csv", {} ],
    [ :get, "/users", {} ], [ :patch, "/users/USER", { active: false } ],
    [ :post, "/invitations", { email: "new@example.com" } ], [ :delete, "/invitations/INVITATION", {} ]
  ]
  endpoints.each do |verb, path, body|
    describe "#{verb.upcase} #{path}" do
      let(:url) do
        "/api/v1/admin#{path}".sub("ORDER", order.number).sub("PRODUCT", product.slug).sub("DROP", drop.slug).sub("USER", other_admin.id.to_s).sub("INVITATION", invitation.id.to_s).sub("DELIVERY", delivery.id.to_s)
      end
      it "returns 401 without a token" do
        public_send(verb, url, params: body, **(verb == :get ? {} : { as: :json }))
        expect(response).to have_http_status(:unauthorized)
        expect(response.parsed_body.dig("error", "code")).to eq("unauthenticated")
      end
      it "returns 403 for a verified non-admin identity" do
        stub_identity("user_shopper", email: "shopper@example.com")
        public_send(verb, url, params: body, headers: { "Authorization" => "Bearer #{session_token('user_shopper')}" }, **(verb == :get ? {} : { as: :json }))
        expect(response).to have_http_status(:forbidden)
      end
      it "succeeds for an active admin" do
        public_send(verb, url, params: body, headers: headers, **(verb == :get ? {} : { as: :json }))
        expect(response).to have_http_status(verb == :post && path == "/invitations" ? :created : :ok), response.body
      end
    end
  end

  it "paginates, filters, and searches orders without treating wildcard input as SQL" do
    get "/api/v1/admin/orders", params: { status: "paid", fulfillment: "unfulfilled", q: "BUYER@", page: 1 }, headers: headers
    expect(response.parsed_body).to include("total" => 1, "page" => 1, "pages" => 1)
    expect(response.parsed_body["orders"].first).to include("item_count" => 1, "number" => order.number)
    get "/api/v1/admin/orders", params: { q: "%" }, headers: headers
    expect(response.parsed_body["total"]).to eq(0)
  end

  it "returns dashboard totals, low stock and featured-drop stock" do
    product.update!(kind: "drop", drop: drop, stock_quantity: 5)
    Subscriber.create!(email: "sub@example.com", source: "home")
    get "/api/v1/admin/dashboard", headers: headers
    expect(response.parsed_body["orders"]).to include("paid_count" => 1, "paid_total_cents" => 3500, "unfulfilled_count" => 1)
    expect(response.parsed_body.dig("featured_drop", "product", "stock_quantity")).to eq(5)
    expect(response.parsed_body["subscribers_count"]).to eq(1)
  end

  it "returns full order snapshots and saved notes, ignoring non-editable fields" do
    patch "/api/v1/admin/orders/#{order.number}", params: { notes: "Fragile", total_cents: 0, status: "refunded" }, headers: headers, as: :json
    expect(order.reload).to have_attributes(notes: "Fragile", total_cents: 3500, status: "paid")
    expect(response.parsed_body["order"]).to include("items", "shipping", "provider", "provider_payment_intent_id", "email_deliveries")
  end

  it "fulfills once, keeps tracking, queues one shipped email, and unfulfills" do
    2.times do
      post "/api/v1/admin/orders/#{order.number}/fulfill", params: { tracking_number: "TRACK123", tracking_url: "https://tracking.example.com/123", notify: true }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
    end
    expect(order.reload).to have_attributes(fulfillment_status: "fulfilled", tracking_number: "TRACK123")
    expect(order.fulfilled_at).to be_present
    expect(order.email_deliveries.where(kind: "order_shipped").count).to eq(1)
    post "/api/v1/admin/orders/#{order.number}/unfulfill", headers: headers
    expect(order.reload).to have_attributes(fulfillment_status: "unfulfilled", fulfilled_at: nil)
  end

  it "rejects fulfillment for unpaid orders and unsafe tracking links" do
    order.update!(status: "pending_payment")
    post "/api/v1/admin/orders/#{order.number}/fulfill", headers: headers
    expect(response).to have_http_status(:unprocessable_content)
    order.update_columns(status: "paid")
    post "/api/v1/admin/orders/#{order.number}/fulfill", params: { tracking_url: "javascript:alert(1)" }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "does not allow resending an email belonging to another order" do
    another = make_order
    post "/api/v1/admin/orders/#{another.number}/email_deliveries/#{delivery.id}/resend", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "edits product content without changing inventory, images, identity, or order prices" do
    patch "/api/v1/admin/products/#{product.slug}", headers: headers, as: :json, params: {
      price_cents: 4900, specs: { material: "Cardboard" }, includes: [ "Puzzle" ], art: { credit: "Christian", story: "Guåhan", evil: true }, placeholders: [],
      stock_quantity: 0, slug: "changed", kind: "drop", images: []
    }
    expect(response).to have_http_status(:ok)
    expect(product.reload).to have_attributes(price_cents: 4900, stock_quantity: 49, specs: { "material" => "Cardboard" }, art: { "credit" => "Christian", "story" => "Guåhan" })
    expect(product.images).not_to be_empty
    expect(order.order_items.first.unit_price_cents).to eq(3500)
  end

  it "validates product and drop updates" do
    patch "/api/v1/admin/products/#{product.slug}", params: { price_cents: -1 }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)
    patch "/api/v1/admin/drops/#{drop.slug}", params: { release_at: 2.days.from_now.iso8601, closes_at: 1.day.from_now.iso8601 }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)
    patch "/api/v1/admin/drops/#{drop.slug}", params: { quantity: 500 }, headers: headers, as: :json
    expect(drop.reload.quantity).to eq(500)
    expect(product.reload.stock_quantity).to eq(49)
  end

  it "records adjustments with a note and rejects invalid or below-zero adjustments" do
    post "/api/v1/admin/products/#{product.slug}/stock_adjustments", params: { delta: -2, reason: "Damaged box" }, headers: headers, as: :json
    expect(product.reload.stock_quantity).to eq(47)
    expect(InventoryMovement.order(:id).last).to have_attributes(reason: "admin_adjustment", note: "Damaged box", delta: -2, order_id: nil)
    [ 0, -100, "2", 1.5, nil ].each do |delta|
      post "/api/v1/admin/products/#{product.slug}/stock_adjustments", params: { delta: delta, reason: "Count" }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_adjustment")
    end
    expect(product.reload.stock_quantity).to eq(47)
  end

  it "paginates subscribers and exports safe CSV" do
    26.times { |n| Subscriber.create!(email: "sub#{n}@example.com", source: "footer") }
    get "/api/v1/admin/subscribers?page=2", headers: headers
    expect(response.parsed_body).to include("total" => 26, "pages" => 2)
    expect(response.parsed_body["subscribers"].size).to eq(1)
    get "/api/v1/admin/subscribers.csv", headers: headers
    expect(response.media_type).to eq("text/csv")
    expect(CSV.parse(response.body).size).to eq(27)
  end

  it "creates one invitation with the required Clerk payload and revokes idempotently" do
    2.times { post "/api/v1/admin/invitations", params: { email: " NEW@example.com " }, headers: headers, as: :json }
    expect(AdminInvitation.pending.where(email: "new@example.com").count).to eq(1)
    expect(a_request(:post, "https://api.clerk.com/v1/invitations").with(body: { email_address: "new@example.com", redirect_url: "http://localhost:5181/admin/sign-up", ignore_existing: true }.to_json)).to have_been_made.once
    2.times { delete "/api/v1/admin/invitations/#{invitation.id}", headers: headers }
    expect(invitation.reload.revoked_at).to be_present
    expect(a_request(:post, "https://api.clerk.com/v1/invitations/inv_pending/revoke")).to have_been_made.once
  end

  it "returns 503 on invitation failure and leaves no qualifying invitation" do
    stub_request(:post, "https://api.clerk.com/v1/invitations").to_timeout
    post "/api/v1/admin/invitations", params: { email: "new@example.com" }, headers: headers, as: :json
    expect(response).to have_http_status(:service_unavailable)
    expect(AdminInvitation.pending.where(email: "new@example.com")).not_to exist
  end

  it "rejects self-deactivation and cannot remove the last active admin" do
    patch "/api/v1/admin/users/#{admin.id}", params: { active: false }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)
    other_admin.update!(active: false)
    patch "/api/v1/admin/users/#{admin.id}", params: { active: false }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)
    expect(admin.reload).to be_active
  end

  it "permits browser PATCH/DELETE preflights only for the allowed web origin" do
    %w[PATCH DELETE].each do |method|
      options "/api/v1/admin/users/1", headers: { "Origin" => "http://localhost:5181", "Access-Control-Request-Method" => method, "Access-Control-Request-Headers" => "authorization,content-type" }
      expect(response).to have_http_status(:ok)
      expect(response.headers["Access-Control-Allow-Methods"]).to include(method)
      expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:5181")
    end
    options "/api/v1/admin/users/1", headers: { "Origin" => "https://attacker.example.com", "Access-Control-Request-Method" => "PATCH" }
    expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
  end
end
