require "rails_helper"

RSpec.describe "Store settings and pages", type: :request do
  it "defaults to closed, with the agreed contact email" do
    allow(StoreSetting).to receive(:sales_open?).and_call_original
    store = StoreSetting.current
    expect(store).to have_attributes(sales_open: false, contact_email: "hello@shimizu-technology.com")
    expect(StoreSetting.sales_open?).to be(false)
  end

  it "returns settings publicly and renders the contact email into pages" do
    StoreSetting.current.update!(contact_email: "hello@example.com")
    Page.create!(slug: "returns", title: "Returns & refunds", body: "Email {{contact_email}}.")
    get "/api/v1/store"
    expect(response.parsed_body.dig("store", "contact_email")).to eq("hello@example.com")
    get "/api/v1/pages/returns"
    expect(response.parsed_body["page"]).to include("title" => "Returns & refunds", "body" => "Email hello@example.com.")
    get "/api/v1/pages/secret"
    expect(response).to have_http_status(:not_found)
  end

  it "includes the store in the storefront payload" do
    get "/api/v1/storefront"
    expect(response.parsed_body["store"]).to include("tagline" => "A piece of home.")
  end

  context "while the store is closed" do
    let!(:core) { create(:product) }
    let!(:limited) { create(:product, :limited) }
    before { allow(StoreSetting).to receive(:sales_open?).and_return(false) }

    it "marks everything coming soon and hides stock counts" do
      core.update!(stock_quantity: 3)
      get "/api/v1/products/#{core.slug}"
      product = response.parsed_body["product"]
      expect(product["availability"]).to eq("state" => "coming_soon", "purchasable" => false, "remaining" => nil, "low_stock" => false)
      expect(product["max_per_order"]).to eq(0)
    end

    it "keeps a released drop upcoming, without showing the past date" do
      get "/api/v1/drops/#{limited.drop.slug}"
      expect(response.parsed_body["drop"]).to include("state" => "upcoming", "release_at" => nil)
    end

    it "keeps a future date visible" do
      limited.drop.update!(release_at: 3.days.from_now)
      get "/api/v1/drops/#{limited.drop.slug}"
      expect(response.parsed_body.dig("drop", "release_at")).to be_present
    end

    it "refuses checkout and takes no stock" do
      post "/api/v1/checkout", params: with_shipping({ email: "a@example.com", idempotency_key: "k", items: [ { product_slug: core.slug, quantity: 1 } ] }), as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body.dig("error", "code")).to eq("store_closed")
      expect(core.reload.stock_quantity).to eq(50)
    end
  end
end
