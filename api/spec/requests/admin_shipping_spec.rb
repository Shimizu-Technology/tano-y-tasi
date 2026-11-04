require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Admin shipping and labels", type: :request do
  include_context "admin auth"

  let(:origin) { { "name" => "Christian", "company" => "Tåno + Tåsi", "phone" => "671-555-0199", "line1" => "1 Harmon Loop", "line2" => "", "city" => "Dededo", "state" => "GU", "postal_code" => "96929" } }
  let(:product) { create(:product) }
  let(:items) { [ { product_slug: product.slug, quantity: 1 } ] }
  let(:shipment_url) { "https://api.easypost.com/v2/shipments/shp_1" }
  let(:live_method) { { amount_cents: 900, kind: "live", label: "USPS Ground Advantage", carrier: "USPS", service: "GroundAdvantage", provider_shipment_id: "shp_1", provider_rate_id: "rate_old", cost_cents: 820 } }
  let(:bought) do
    { id: "shp_1", tracking_code: "9400111", postage_label: { label_url: "https://easypost-files.s3.amazonaws.com/label.png" }, selected_rate: { id: "rate_new", rate: "8.20", carrier: "USPS", service: "GroundAdvantage" }, tracker: { public_url: "https://track.easypost.com/abc", status: "pre_transit" }, rates: [] }
  end
  let(:unbought) { { id: "shp_1", postage_label: nil, selected_rate: nil, rates: [ { id: "rate_old", rate: "8.20", currency: "USD", carrier: "USPS", service: "GroundAdvantage" } ] } }

  def rerated(rate: "8.20")
    { rates: [ { id: "rate_new", rate: rate, currency: "USD", carrier: "USPS", service: "GroundAdvantage" }, { id: "rate_other", rate: "30.00", currency: "USD", carrier: "USPS", service: "Express" } ] }
  end

  def paid_order(**method)
    method = live_method.merge(method)
    amount = method.delete(:amount_cents)
    kind = method.delete(:kind)
    label = method.delete(:label)
    shipping = shipping_for(items, amount_cents: amount, kind: kind, label: label, **method)
    checkout_call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: items, shipping: shipping).order.tap { |row| row.update!(status: "paid", paid_at: Time.current) }
  end

  def connect(values = {})
    stub_const("ENV", ENV.to_h.merge("EASYPOST_API_KEY" => "EZTK_test"))
    StoreSetting.current.update!(shipping_settings: { mode: "easypost", origin: origin }.merge(values))
  end

  def buy(order, body = {})
    post "/api/v1/admin/orders/#{order.number}/label", params: body, headers: headers, as: :json
  end

  describe "settings" do
    it "requires an admin" do
      get "/api/v1/admin/shipping"
      expect(response).to have_http_status(:unauthorized)
      patch "/api/v1/admin/shipping", params: { mode: "flat" }, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "starts with labelled placeholders, on flat rates, tax off, until the rates are saved" do
      get "/api/v1/admin/shipping", headers: headers
      data = response.parsed_body["shipping"]
      expect(data).to include("mode" => "flat", "flat_rates_placeholder" => true, "tax_enabled" => false, "free_shipping_threshold_cents" => nil, "pickup_enabled" => false, "easypost_configured" => false, "origin_complete" => false)
      expect(data["flat_rates"]).to eq("mainland" => 800, "alaska_hawaii" => 1200, "guam_cnmi" => 1200, "territories" => 1200, "military" => 1200)
      get "/api/v1/admin/store", headers: headers
      expect(response.parsed_body.dig("store", "shipping_placeholders")).to eq(true)
      patch "/api/v1/admin/shipping", params: { flat_rates: { mainland: 950 } }, headers: headers, as: :json
      data = response.parsed_body["shipping"]
      expect(data).to include("flat_rates_placeholder" => false)
      expect(data["flat_rates"]).to include("mainland" => 950, "guam_cnmi" => 1200)
      get "/api/v1/admin/store", headers: headers
      expect(response.parsed_body.dig("store", "shipping_placeholders")).to eq(false)
    end

    it "keeps a merchant's placeholders flagged when something else is saved" do
      patch "/api/v1/admin/shipping", params: { handling_fee_cents: 100 }, headers: headers, as: :json
      expect(response.parsed_body["shipping"]).to include("handling_fee_cents" => 100, "flat_rates_placeholder" => true)
    end

    it "saves everything, and merges nested values" do
      patch "/api/v1/admin/shipping", params: { mode: "easypost", carriers: [ "USPS" ], free_shipping_threshold_cents: 7500, pickup_enabled: true, pickup_instructions: "Tumon", origin: origin, parcel: { weight_oz: 30.5 }, customs: { origin_country: "CN" }, tax_enabled: true }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      data = response.parsed_body["shipping"]
      expect(data).to include("mode" => "easypost", "carriers" => [ "USPS" ], "free_shipping_threshold_cents" => 7500, "pickup_enabled" => true, "tax_enabled" => true, "origin_complete" => true)
      expect(data["parcel"]).to include("weight_oz" => 30.5, "length_in" => 12)
      expect(data["customs"]).to include("origin_country" => "CN", "hs_tariff_number" => "950300")
      patch "/api/v1/admin/shipping", params: { free_shipping_threshold_cents: nil, carriers: [] }, headers: headers, as: :json
      expect(response.parsed_body["shipping"]).to include("free_shipping_threshold_cents" => nil, "carriers" => [])
    end

    {
      { mode: "magic" } => "mode",
      { handling_fee_cents: -1 } => "handling_fee_cents",
      { handling_fee_cents: "5" } => "handling_fee_cents",
      { free_shipping_threshold_cents: 1.5 } => "free_shipping_threshold_cents",
      { flat_rates: { mainland: -5 } } => "flat_rates.mainland",
      { pickup_enabled: true } => "pickup_instructions",
      { pickup_enabled: "yes" } => "pickup_enabled",
      { origin: { state: "ZZ" } } => "origin.state",
      { origin: { postal_code: "1" } } => "origin.postal_code",
      { parcel: { weight_oz: 0 } } => "parcel.weight_oz",
      { customs: { hs_tariff_number: "12" } } => "customs.hs_tariff_number",
      { customs: { origin_country: "China" } } => "customs.origin_country",
      { tax_enabled: "true" } => "tax_enabled"
    }.each do |change, field|
      it "rejects #{change} on #{field}, changing nothing" do
        patch "/api/v1/admin/shipping", params: change, headers: headers, as: :json
        expect(response).to have_http_status(:unprocessable_content)
        expect(response.parsed_body["error"]).to include("code" => "invalid_record")
        expect(response.parsed_body.dig("error", "details")).to include(field)
        expect(StoreSetting.current.reload).to have_attributes(shipping_settings: {}, tax_enabled: false)
      end
    end
  end

  describe "product measurements" do
    it "edits them as numbers, and clears them" do
      patch "/api/v1/admin/products/#{product.slug}", params: { weight_oz: 22.5, length_in: 14, width_in: 11, height_in: 2 }, headers: headers, as: :json
      expect(response.parsed_body["product"]).to include("weight_oz" => 22.5, "length_in" => 14.0, "width_in" => 11.0, "height_in" => 2.0)
      patch "/api/v1/admin/products/#{product.slug}", params: { weight_oz: nil }, headers: headers, as: :json
      expect(response.parsed_body.dig("product", "weight_oz")).to be_nil
    end

    it "rejects a measurement that isn't above zero" do
      patch "/api/v1/admin/products/#{product.slug}", params: { weight_oz: 0 }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body.dig("error", "details")).to include("weight_oz")
    end

    it "never appears in a public payload" do
      product.update!(weight_oz: 22.5)
      get "/api/v1/products/#{product.slug}"
      expect(response.body).not_to include("weight_oz")
    end
  end

  describe "order detail" do
    it "says which rate was used, and offers a label only with EasyPost" do
      order = paid_order(kind: "flat_fallback", label: "Standard", amount_cents: 1200, provider_shipment_id: nil, provider_rate_id: nil, cost_cents: nil, carrier: nil, service: nil)
      get "/api/v1/admin/orders/#{order.number}", headers: headers
      data = response.parsed_body["order"]
      expect(data).to include("shipping_cents" => 1200, "tax_cents" => 0, "total_cents" => 4700, "fulfillment_method" => "ship", "label_available" => false, "label_status" => nil)
      expect(data["shipping_method"]).to include("kind" => "flat_fallback", "label" => "Standard")
      connect
      get "/api/v1/admin/orders/#{order.number}", headers: headers
      expect(response.parsed_body.dig("order", "label_available")).to eq(true)
    end

    it "keeps the manual tracking flow working without EasyPost" do
      order = paid_order
      post "/api/v1/admin/orders/#{order.number}/fulfill", params: { tracking_number: "MANUAL1", tracking_url: "https://track.example/1", notify: false }, headers: headers, as: :json
      expect(response.parsed_body["order"]).to include("fulfillment_status" => "fulfilled", "tracking_number" => "MANUAL1")
    end
  end

  describe "buying a label" do
    before { connect }

    it "buys the saved service at the current rate, once, and stores what it gets back" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated.to_json)
      purchase = stub_request(:post, "#{shipment_url}/buy").with(body: { rate: { id: "rate_new" } }.to_json).to_return(body: bought.to_json)
      buy(order)
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["order"]).to include("label_status" => "bought", "label_url" => "https://easypost-files.s3.amazonaws.com/label.png", "label_cost_cents" => 820, "tracking_number" => "9400111", "tracking_url" => "https://track.easypost.com/abc", "tracking_status" => "pre_transit", "fulfillment_status" => "unfulfilled")
      buy(order)
      expect(response).to have_http_status(:ok)
      expect(purchase).to have_been_requested.once
    end

    it "adopts a label an earlier attempt bought when its answer was lost" do
      order = paid_order
      order.update!(label_shipment_id: "shp_1", label_status: "buying")
      stub_request(:get, shipment_url).to_return(body: bought.to_json)
      purchase = stub_request(:post, "#{shipment_url}/buy")
      buy(order)
      expect(response.parsed_body["order"]).to include("label_status" => "bought", "tracking_number" => "9400111")
      expect(purchase).not_to have_been_requested
    end

    it "leaves a retryable state when the purchase times out, and a retry can't buy twice" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json).then.to_return(body: bought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated.to_json)
      purchase = stub_request(:post, "#{shipment_url}/buy").to_timeout
      buy(order)
      expect(response).to have_http_status(:service_unavailable)
      expect(response.parsed_body.dig("error", "code")).to eq("shipping_unavailable")
      expect(order.reload.label_status).to eq("buying")
      expect(order.label_url).to be_nil
      buy(order)
      expect(response).to have_http_status(:ok)
      expect(order.reload.label_status).to eq("bought")
      expect(purchase).to have_been_requested.once
    end

    it "asks before buying when the rate has moved, and only buys the confirmed price" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated(rate: "9.65").to_json)
      purchase = stub_request(:post, "#{shipment_url}/buy").to_return(body: bought.to_json)
      buy(order)
      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body["error"]).to include("code" => "label_price_changed")
      expect(response.parsed_body.dig("error", "details")).to include("previous_cents" => 820, "current_cents" => 965, "label" => "USPS Ground Advantage")
      expect(response.parsed_body.dig("error", "message")).to include("$8.20", "$9.65")
      expect(purchase).not_to have_been_requested
      buy(order, confirm_cents: 900)
      expect(response).to have_http_status(:conflict)
      expect(purchase).not_to have_been_requested
      buy(order, confirm_cents: 965)
      expect(response).to have_http_status(:ok)
      expect(purchase).to have_been_requested.once
    end

    it "makes a shipment for an order that fell back to flat rates, and asks about its price first" do
      order = paid_order(kind: "flat_fallback", label: "Standard", amount_cents: 1200, provider_shipment_id: nil, provider_rate_id: nil, cost_cents: nil, carrier: nil, service: nil)
      created = stub_request(:post, "https://api.easypost.com/v2/shipments").with { |request|
        sent = JSON.parse(request.body).fetch("shipment")
        expect(sent["to_address"]).to include("name" => "A Buyer", "state" => "GU", "zip" => "96910")
        expect(sent).to include("customs_info")
        true
      }.to_return(status: 201, body: unbought.to_json)
      stub_request(:get, shipment_url).to_return(body: unbought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated.to_json)
      purchase = stub_request(:post, "#{shipment_url}/buy").with(body: { rate: { id: "rate_new" } }.to_json).to_return(body: bought.to_json)
      buy(order)
      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body.dig("error", "details")).to include("previous_cents" => nil, "current_cents" => 820)
      expect(order.reload.label_shipment_id).to eq("shp_1")
      buy(order, confirm_cents: 820)
      expect(response).to have_http_status(:ok)
      expect(created).to have_been_requested.once
      expect(purchase).to have_been_requested.once
    end

    it "gives a second order on the same quote its own shipment, never the first's label" do
      first = paid_order
      first.update!(label_shipment_id: "shp_1", label_status: "bought", label_url: "https://easypost-files.s3.amazonaws.com/first.png")
      second = paid_order
      fresh = unbought.merge(id: "shp_2")
      stub_request(:post, "https://api.easypost.com/v2/shipments").to_return(status: 201, body: fresh.to_json)
      stub_request(:post, "https://api.easypost.com/v2/shipments/shp_2/rerate").to_return(body: rerated.to_json)
      stub_request(:post, "https://api.easypost.com/v2/shipments/shp_2/buy").to_return(body: bought.merge(id: "shp_2", tracking_code: "SECOND").to_json)
      buy(second)
      expect(response).to have_http_status(:ok)
      expect(second.reload).to have_attributes(label_shipment_id: "shp_2", tracking_number: "SECOND")
      expect(first.reload.label_url).to end_with("first.png")
    end

    it "reports a label EasyPost refuses, clears the attempt, and can try again" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated.to_json)
      stub_request(:post, "#{shipment_url}/buy").to_return(status: 422, body: { error: { code: "SHIPMENT.POSTAGE.FAILURE", message: "Insufficient funds." } }.to_json)
      buy(order)
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to include("code" => "label_rejected")
      expect(response.parsed_body.dig("error", "message")).to include("Insufficient funds.")
      expect(order.reload.label_status).to be_nil
    end

    it "adopts the existing label when EasyPost refuses because it's already bought" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json).then.to_return(body: bought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated.to_json)
      stub_request(:post, "#{shipment_url}/buy").to_return(status: 422, body: { error: { code: "SHIPMENT.POSTAGE.EXISTS", message: "Already purchased." } }.to_json)
      buy(order)
      expect(response).to have_http_status(:ok)
      expect(order.reload.label_status).to eq("bought")
    end

    it "answers cleanly when EasyPost sends a rate with no price" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: { rates: [ { id: "r", currency: "USD", carrier: "USPS", service: "GroundAdvantage" } ] }.to_json)
      buy(order)
      expect(response).to have_http_status(:service_unavailable)
      expect(response.parsed_body.dig("error", "code")).to eq("shipping_unavailable")
    end

    it "refuses an unpaid, picked-up, fulfilled or incomplete-origin order, without calling EasyPost" do
      order = paid_order
      order.update!(status: "needs_attention")
      buy(order)
      expect(response.parsed_body.dig("error", "code")).to eq("label_unavailable")
      order.update!(status: "paid", fulfillment_method: "pickup")
      buy(order)
      expect(response.parsed_body.dig("error", "code")).to eq("label_unavailable")
      order.update!(fulfillment_method: "ship", fulfillment_status: "fulfilled")
      buy(order)
      expect(response.parsed_body.dig("error", "code")).to eq("label_unavailable")
      order.update!(fulfillment_status: "unfulfilled")
      connect(origin: { line1: "" })
      buy(order)
      expect(response.parsed_body.dig("error", "code")).to eq("label_unavailable")
      expect(WebMock).not_to have_requested(:any, /easypost/)
    end

    it "is refused without a key" do
      order = paid_order
      stub_const("ENV", ENV.to_h.except("EASYPOST_API_KEY"))
      buy(order)
      expect(response.parsed_body.dig("error", "code")).to eq("label_unavailable")
    end

    it "fulfills with the label's tracking and emails it" do
      order = paid_order
      stub_request(:get, shipment_url).to_return(body: unbought.to_json)
      stub_request(:post, "#{shipment_url}/rerate").to_return(body: rerated.to_json)
      stub_request(:post, "#{shipment_url}/buy").to_return(body: bought.to_json)
      buy(order)
      post "/api/v1/admin/orders/#{order.number}/fulfill", params: { notify: true }, headers: headers, as: :json
      expect(response.parsed_body["order"]).to include("fulfillment_status" => "fulfilled", "tracking_number" => "9400111")
      delivery = order.reload.email_deliveries.find_by(kind: "order_shipped")
      expect(Emails::Template.payload(delivery)[:text]).to include("9400111", "https://track.easypost.com/abc")
    end
  end
end
