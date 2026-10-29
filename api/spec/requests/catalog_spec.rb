require "rails_helper"

RSpec.describe "Catalog", type: :request do
  let!(:core) { create(:product) }
  let!(:limited) { create(:product, :limited) }
  let!(:draft) { create(:product, status: "draft") }

  it "returns core products and a live featured drop with server time" do
    get "/api/v1/storefront"
    expect(response).to have_http_status(:ok)
    json = response.parsed_body
    expect(json["core_products"].map { |p| p["slug"] }).to eq([ core.slug ])
    expect(json.dig("featured_drop", "product", "slug")).to eq(limited.slug)
    expect(json.dig("featured_drop", "state")).to eq("live")
    expect(Time.iso8601(json["server_time"])).to be_within(2.seconds).of(Time.current)
  end

  it "omits summary specs the catalog still marks as placeholders" do
    core.update!(specs: { piece_count: 750, finished_size: "22 × 30 in" }, placeholders: [ "specs.finished_size" ])
    get "/api/v1/storefront"
    expect(response.parsed_body["core_products"].first["specs"]).to eq("piece_count" => 750)
  end

  it "includes only summary specs in every product summary" do
    core.update!(specs: { piece_count: 100, finished_size: "12 × 9 in", material: "Cardboard" })
    limited.update!(specs: { piece_count: 500, finished_size: "16 × 20 in", material: "Cardboard" })
    get "/api/v1/storefront"
    expect(response.parsed_body["core_products"].first["specs"]).to eq("piece_count" => 100, "finished_size" => "12 × 9 in")
    expect(response.parsed_body.dig("featured_drop", "product", "specs")).to eq("piece_count" => 500, "finished_size" => "16 × 20 in")
    get "/api/v1/products"
    expect(response.parsed_body["products"].map { |p| p["specs"].keys }).to all(match_array([ "piece_count", "finished_size" ]))
    get "/api/v1/drops"
    expect(response.parsed_body.dig("current", "product", "specs")).to eq("piece_count" => 500, "finished_size" => "16 × 20 in")
    get "/api/v1/products/#{core.slug}"
    expect(response.parsed_body.dig("product", "specs", "material")).to eq("Cardboard")
  end

  it "features the next upcoming drop, or null when none is left" do
    limited.drop.update!(release_at: 1.day.from_now)
    get "/api/v1/storefront"
    expect(response.parsed_body.dig("featured_drop", "state")).to eq("upcoming")
    limited.drop.update!(release_at: 1.day.ago, closes_at: 1.hour.ago)
    get "/api/v1/storefront"
    expect(response.parsed_body["featured_drop"]).to be_nil
  end

  it "filters products by kind, excludes drafts, and rejects an invalid filter" do
    get "/api/v1/products", params: { kind: "core" }
    expect(response.parsed_body["products"].map { |p| p["slug"] }).to eq([ core.slug ])
    get "/api/v1/products", params: { kind: "drop" }
    expect(response.parsed_body["products"].map { |p| p["slug"] }).to eq([ limited.slug ])
    get "/api/v1/products"
    expect(response.parsed_body["products"].size).to eq(2)
    get "/api/v1/products", params: { kind: "other" }
    expect(response).to have_http_status(:bad_request)
  end

  it "returns detail, stock privacy, order max, and a timestamp" do
    get "/api/v1/products/#{core.slug}"
    json = response.parsed_body
    expect(json.dig("product", "availability")).to eq("state" => "available", "purchasable" => true, "remaining" => nil, "low_stock" => false)
    expect(json["product"]).to include("description", "images", "specs", "includes", "art", "placeholders", "max_per_order" => 10, "per_customer_limit" => nil)
    expect(json["server_time"]).to be_present
    core.update!(stock_quantity: 20)
    get "/api/v1/products/#{core.slug}"
    expect(response.parsed_body.dig("product", "availability", "remaining")).to eq(20)
    core.update!(stock_quantity: 3)
    get "/api/v1/products/#{core.slug}"
    expect(response.parsed_body.dig("product", "max_per_order")).to eq(3)
  end

  it "renders drop lifecycle and archive membership with product data" do
    limited.drop.update!(release_at: 1.day.from_now)
    get "/api/v1/drops"
    expect(response.parsed_body["current"]).to be_nil
    expect(response.parsed_body["upcoming"].first["state"]).to eq("upcoming")
    get "/api/v1/drops/#{limited.drop.slug}"
    expect(response.parsed_body.dig("drop", "product", "max_per_order")).to eq(0)
    expect(response.parsed_body.dig("drop", "product", "availability", "state")).to eq("upcoming")
    limited.drop.update!(release_at: 1.day.ago)
    get "/api/v1/drops/#{limited.drop.slug}"
    expect(response.parsed_body.dig("drop", "product", "max_per_order")).to eq(2)
    limited.update!(stock_quantity: 0)
    get "/api/v1/drops"
    expect(response.parsed_body["archive"].first["state"]).to eq("sold_out")
    expect(response.parsed_body["current"]).to be_nil
    get "/api/v1/products/#{limited.slug}"
    expect(response.parsed_body.dig("product", "availability")).to eq("state" => "sold_out", "purchasable" => false, "remaining" => 0, "low_stock" => true)
    limited.drop.update!(closes_at: 1.hour.ago)
    get "/api/v1/drops/#{limited.drop.slug}"
    expect(response.parsed_body.dig("drop", "state")).to eq("closed")
    expect(response.parsed_body.dig("drop", "product", "availability", "state")).to eq("closed")
  end

  it "does not disclose draft products or drops" do
    limited.update!(status: "draft")
    [ "/api/v1/products/#{draft.slug}", "/api/v1/drops/#{limited.drop.slug}", "/api/v1/products/missing", "/api/v1/drops/missing" ].each do |path|
      get path
      expect(response).to have_http_status(:not_found)
      expect(response.parsed_body.dig("error", "code")).to eq("not_found")
    end
    get "/api/v1/drops"
    expect(response.parsed_body["current"]).to be_nil
  end

  it "lazily releases expired inventory before availability reads" do
    order = Orders::Checkout.call(email: "a@example.com", idempotency_key: "read-expiry", items: [ { product_slug: core.slug, quantity: 1 } ]).order
    order.update!(expires_at: 6.minutes.ago)
    get "/api/v1/products/#{core.slug}"
    expect(order.reload.status).to eq("expired")
    expect(core.reload.stock_quantity).to eq(50)
  end

  it "keeps /up boot-only and rejects unknown routes with JSON" do
    expect(Orders::ReleaseExpired).not_to receive(:call)
    get "/up"
    expect(response).to have_http_status(:ok)
    get "/missing"
    expect(response).to have_http_status(:not_found)
    expect(response.parsed_body).to include("error")
  end
end
