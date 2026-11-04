require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Commerce model", type: :request do
  def slugs(list)
    list.map { |product| product["slug"] }
  end

  def checkout(product, email: "buyer@example.com", quantity: 1)
    post "/api/v1/checkout", params: { email: email, idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: quantity } ] }, as: :json
  end

  describe "signature products" do
    let!(:plain) { create(:product, position: 1) }
    let!(:signature) { create(:product, position: 5, signature: true) }
    let!(:second_signature) { create(:product, position: 6, signature: true) }

    it "lead the core collection and every list, with several allowed" do
      get "/api/v1/storefront"
      expect(slugs(response.parsed_body["core_products"])).to eq([ signature.slug, second_signature.slug, plain.slug ])
      expect(response.parsed_body["core_products"].first).to include("signature" => true)
      get "/api/v1/products", params: { kind: "core" }
      expect(slugs(response.parsed_body["products"])).to eq([ signature.slug, second_signature.slug, plain.slug ])
    end
  end

  describe "per-product limits" do
    let(:drop) { create(:drop, per_customer_limit: 3) }
    let(:core) { create(:product, per_customer_limit: 1) }
    let(:follows_drop) { create(:product, :limited, drop: drop) }
    let(:overrides_drop) { create(:product, :limited, drop: drop, per_customer_limit: 1) }

    it "uses the product's own, else its drop's, else none" do
      expect(create(:product).effective_limit).to be_nil
      expect(core.effective_limit).to eq(1)
      expect(follows_drop.effective_limit).to eq(3)
      expect(overrides_drop.effective_limit).to eq(1)
    end

    it "reports the effective limit and the order maximum" do
      get "/api/v1/products/#{core.slug}"
      expect(response.parsed_body["product"]).to include("per_customer_limit" => 1, "max_per_order" => 1)
      get "/api/v1/products/#{follows_drop.slug}"
      expect(response.parsed_body["product"]).to include("per_customer_limit" => 3, "max_per_order" => 3)
      get "/api/v1/products/#{overrides_drop.slug}"
      expect(response.parsed_body["product"]).to include("per_customer_limit" => 1, "max_per_order" => 1)
      get "/api/v1/products"
      expect(response.parsed_body["products"].find { |item| item["slug"] == core.slug }).to include("per_customer_limit" => 1)
    end

    it "never offers more than checkout takes per order" do
      product = create(:product, per_customer_limit: 50)
      get "/api/v1/products/#{product.slug}"
      expect(response.parsed_body["product"]).to include("per_customer_limit" => 50, "max_per_order" => 10)
    end

    it "enforces a core product's limit with accurate copy, across orders and email variants" do
      gmail = create(:product, per_customer_limit: 2, name: "Tumon Bay")
      checkout(gmail, email: "a.b+one@gmail.com", quantity: 2)
      expect(response).to have_http_status(:created)
      checkout(gmail, email: "ab@gmail.com")
      expect(response).to have_http_status(:unprocessable_content)
      body = response.parsed_body["error"]
      expect(body).to include("code" => "limit_exceeded", "message" => "Tumon Bay is limited to 2 per customer.")
      expect(body["details"]).to eq("product_slug" => gmail.slug, "limit" => 2, "already_purchased" => 2)
    end

    it "lets a product's own limit override its drop's in both directions" do
      checkout(overrides_drop, quantity: 2)
      expect(response.parsed_body.dig("error", "details", "limit")).to eq(1)
      generous = create(:product, :limited, drop: drop, per_customer_limit: 5)
      checkout(generous, quantity: 4)
      expect(response).to have_http_status(:created)
    end

    it "flags a completed payment that passes the effective limit, on a core product too" do
      order = Orders::Checkout.call(email: "buyer@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: core.slug, quantity: 1 } ]).order
      paid_first = Orders::Checkout.call(email: "other@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: core.slug, quantity: 1 } ]).order
      Payments::Complete.call(paid_first)
      paid_first.update!(email: "buyer@example.com")
      stock = core.reload.stock_quantity
      Payments::Complete.call(order)
      expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "customer_limit_exceeded")
      expect(core.reload.stock_quantity).to eq(stock + 1)
    end

    it "rejects a limit that isn't a positive whole number at the model and the database" do
      expect(build(:product, per_customer_limit: 0)).not_to be_valid
      expect(build(:product, per_customer_limit: 1.5)).not_to be_valid
      expect { create(:product).update_column(:per_customer_limit, 0) }.to raise_error(ActiveRecord::StatementInvalid)
    end
  end

  describe "drops with several products" do
    let(:drop) { create(:drop, per_customer_limit: 2) }
    let!(:lead) { create(:product, :limited, drop: drop, position: 1, name: "Lead") }
    let!(:second) { create(:product, :limited, drop: drop, position: 2, name: "Second") }
    let!(:draft) { create(:product, :limited, drop: drop, position: 0, status: "draft", name: "Draft") }

    it "lists only the products customers may see, lead first, everywhere a drop appears" do
      get "/api/v1/drops/#{drop.slug}"
      json = response.parsed_body["drop"]
      expect(slugs(json["products"])).to eq([ lead.slug, second.slug ])
      expect(json["product"]["slug"]).to eq(lead.slug)
      expect(json["products"].first).to include("description", "images", "max_per_order")
      get "/api/v1/storefront"
      expect(response.parsed_body.dig("featured_drop", "product", "slug")).to eq(lead.slug)
      expect(slugs(response.parsed_body.dig("featured_drop", "products"))).to eq([ lead.slug, second.slug ])
      get "/api/v1/drops"
      expect(slugs(response.parsed_body.dig("current", "products"))).to eq([ lead.slug, second.slug ])
    end

    it "keeps a one-product drop's payload shape and appears once in the lists" do
      solo = create(:drop)
      only = create(:product, :limited, drop: solo)
      get "/api/v1/drops/#{solo.slug}"
      expect(response.parsed_body.dig("drop", "product", "slug")).to eq(only.slug)
      expect(slugs(response.parsed_body.dig("drop", "products"))).to eq([ only.slug ])
      get "/api/v1/drops"
      all = [ response.parsed_body["current"], *response.parsed_body["upcoming"], *response.parsed_body["archive"] ].compact
      expect(all.map { |item| item["slug"] }.tally.values).to all(eq(1))
    end

    it "moves to the archive only when every product is gone" do
      lead.update!(stock_quantity: 0)
      get "/api/v1/drops"
      expect(response.parsed_body.dig("current", "slug")).to eq(drop.slug)
      second.update!(stock_quantity: 0)
      get "/api/v1/drops"
      expect(response.parsed_body["archive"].map { |item| item["slug"] }).to eq([ drop.slug ])
    end

    it "serves a drop whose lead is hidden, and hides a drop with nothing to show" do
      lead.update!(status: "draft")
      second.update!(images: [])
      get "/api/v1/drops/#{drop.slug}"
      expect(response).to have_http_status(:not_found)
      second.update!(images: lead.images)
      get "/api/v1/drops/#{drop.slug}"
      expect(response.parsed_body.dig("drop", "product", "slug")).to eq(second.slug)
    end

    it "doesn't query per product for a drop's siblings" do
      queries = 0
      callback = ->(*, payload) { queries += 1 if payload[:sql].match?(/FROM "products"/) && !payload[:cached] }
      get "/api/v1/drops"
      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") { get "/api/v1/drops" }
      few = queries
      3.times { create(:product, :limited, drop: drop) }
      queries = 0
      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") { get "/api/v1/drops" }
      expect(queries).to eq(few)
    end

    it "flags a late payment for a closed drop, but honors a checkout that held its stock" do
      held = Orders::Checkout.call(email: "held@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: lead.slug, quantity: 1 } ]).order
      late = Orders::Checkout.call(email: "late@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: second.slug, quantity: 1 } ]).order
      Orders::Release.call(late, status: "expired")
      drop.update!(closes_at: 1.minute.ago)
      Payments::Complete.call(held)
      Payments::Complete.call(late)
      expect(held.reload.status).to eq("paid")
      expect(late.reload).to have_attributes(status: "needs_attention", attention_reason: "drop_closed")
    end

    it "flags a payment for one withdrawn product in a mixed order and releases all of it" do
      core = create(:product)
      order = Orders::Checkout.call(email: "buyer@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: lead.slug, quantity: 1 }, { product_slug: core.slug, quantity: 1 } ]).order
      drop.update!(release_at: nil)
      Payments::Complete.call(order)
      expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "drop_withdrawn")
      expect(core.reload.stock_quantity).to eq(50)
      expect(lead.reload.stock_quantity).to eq(50)
    end
  end

  describe "preorders" do
    let(:product) { create(:product, preorder: true, preorder_ships: "Ships late January 2027", stock_quantity: 5) }

    it "is purchasable as a preorder, limited by the units allotted" do
      get "/api/v1/products/#{product.slug}"
      expect(response.parsed_body["product"]).to include("preorder" => true, "preorder_ships" => "Ships late January 2027", "max_per_order" => 5)
      expect(response.parsed_body.dig("product", "availability")).to include("state" => "preorder", "purchasable" => true)
      product.update!(stock_quantity: 0)
      get "/api/v1/products/#{product.slug}"
      expect(response.parsed_body.dig("product", "availability")).to include("state" => "sold_out", "purchasable" => false)
    end

    it "stops at the store switch and at the drop's release gate first" do
      allow(StoreSetting).to receive(:sales_open?).and_return(false)
      expect(product.availability).to include(state: "coming_soon", purchasable: false)
      allow(StoreSetting).to receive(:sales_open?).and_return(true)
      gated = create(:product, :limited, drop: create(:drop, release_at: 1.day.from_now), preorder: true, preorder_ships: "Ships soon")
      expect(gated.availability).to include(state: "upcoming", purchasable: false)
      checkout(gated)
      expect(response.parsed_body.dig("error", "code")).to eq("drop_not_live")
      gated.drop.update!(release_at: nil)
      expect(gated.reload.availability).to include(state: "upcoming", purchasable: false)
    end

    it "can't be a preorder without saying when it ships" do
      invalid = build(:product, preorder: true, preorder_ships: "   ")
      expect(invalid).not_to be_valid
      expect(invalid.errors[:preorder_ships]).to be_present
      expect { create(:product).update_column(:preorder, true) }.to raise_error(ActiveRecord::StatementInvalid)
    end

    it "keeps the saved ship text out of public payloads once preorder is off" do
      product.update!(preorder: false)
      get "/api/v1/products/#{product.slug}"
      expect(response.parsed_body["product"]).to include("preorder" => false, "preorder_ships" => nil)
      expect(product.reload.availability[:state]).to eq("available")
    end

    it "snapshots the ship text on the order, so later edits don't rewrite it" do
      checkout(product)
      token = response.parsed_body.dig("order", "token")
      product.update!(preorder_ships: "Ships in April 2027")
      get "/api/v1/orders/#{token}"
      expect(response.parsed_body.dig("order", "items").first).to include("preorder_ships" => "Ships late January 2027")
      expect(product.reload.stock_quantity).to eq(4)
      expect(InventoryMovement.where(product: product).pluck(:delta, :reason)).to eq([ [ -1, "reserve" ] ])
    end

    it "takes a mixed cart as one order and labels only the preorder line" do
      other = create(:product)
      post "/api/v1/checkout", params: { email: "buyer@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 1 }, { product_slug: other.slug, quantity: 1 } ] }, as: :json
      expect(response).to have_http_status(:created)
      get "/api/v1/orders/#{response.parsed_body.dig('order', 'token')}"
      items = response.parsed_body.dig("order", "items").to_h { |item| [ item["product_slug"], item["preorder_ships"] ] }
      expect(items).to eq(product.slug => "Ships late January 2027", other.slug => nil)
    end

    it "names the ship date in the confirmation email, but not once it has shipped" do
      checkout(product)
      order = Order.find_by!(token: response.parsed_body.dig("order", "token"))
      allow(ENV).to receive(:fetch).and_call_original
      allow(ENV).to receive(:fetch).with("MAILER_FROM_EMAIL").and_return("Tåno + Tåsi <orders@example.com>")
      confirmation = Emails::Template.payload(EmailDelivery.new(order: order, kind: "order_confirmation", to: order.email, subject: "Order"))
      expect(confirmation[:text]).to include("Preorder. Ships late January 2027")
      expect(confirmation[:html]).to include("Preorder. Ships late January 2027")
      shipped = Emails::Template.payload(EmailDelivery.new(order: order, kind: "order_shipped", to: order.email, subject: "Order"))
      expect(shipped[:text]).not_to include("Preorder")
    end
  end

  describe "admin" do
    include_context "admin auth"

    let!(:product) { create(:product) }

    it "saves the commercial fields on a product" do
      patch "/api/v1/admin/products/#{product.slug}", params: { signature: true, per_customer_limit: 2, preorder: true, preorder_ships: "  Ships late January 2027  " }, headers: headers, as: :json
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body["product"]).to include("signature" => true, "per_customer_limit" => 2, "preorder" => true, "preorder_ships" => "Ships late January 2027")
      patch "/api/v1/admin/products/#{product.slug}", params: { per_customer_limit: nil }, headers: headers, as: :json
      expect(product.reload.per_customer_limit).to be_nil
    end

    it "reports field errors for bad commercial values" do
      patch "/api/v1/admin/products/#{product.slug}", params: { preorder: true }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body.dig("error", "details")).to have_key("preorder_ships")
      patch "/api/v1/admin/products/#{product.slug}", params: { per_customer_limit: 0 }, headers: headers, as: :json
      expect(response.parsed_body.dig("error", "details")).to have_key("per_customer_limit")
      patch "/api/v1/admin/products/#{product.slug}", params: { preorder_ships: "x" * 121 }, headers: headers, as: :json
      expect(response.parsed_body.dig("error", "details")).to have_key("preorder_ships")
      %w[signature preorder].each do |flag|
        patch "/api/v1/admin/products/#{product.slug}", params: { flag => "yes" }, headers: headers, as: :json
        expect(response.parsed_body.dig("error", "details")).to have_key(flag)
        patch "/api/v1/admin/products/#{product.slug}", params: { flag => nil }, headers: headers, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end
      expect(product.reload).to have_attributes(signature: false, preorder: false, per_customer_limit: nil)
    end

    it "lists a drop's products and makes preorder lines obvious on orders" do
      drop = create(:drop)
      first = create(:product, :limited, drop: drop, position: 1)
      second = create(:product, :limited, drop: drop, position: 2, status: "draft")
      get "/api/v1/admin/drops/#{drop.slug}", headers: headers
      expect(response.parsed_body.dig("drop", "products")).to eq([
        { "slug" => first.slug, "name" => first.name, "stock_quantity" => 50, "status" => "active" },
        { "slug" => second.slug, "name" => second.name, "stock_quantity" => 50, "status" => "draft" }
      ])
      product.update!(preorder: true, preorder_ships: "Ships late January 2027")
      post "/api/v1/checkout", params: { email: "buyer@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 }, { product_slug: first.slug, quantity: 1 } ] }, as: :json
      get "/api/v1/admin/orders", headers: headers
      expect(response.parsed_body["orders"].first).to include("item_count" => 3, "preorder_item_count" => 2)
      get "/api/v1/admin/orders/#{response.parsed_body['orders'].first['number']}", headers: headers
      expect(response.parsed_body.dig("order", "items").map { |item| item["preorder_ships"] }).to contain_exactly("Ships late January 2027", nil)
    end
  end
end
