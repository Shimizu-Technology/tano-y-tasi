require "rails_helper"

RSpec.describe "Shipping quotes", type: :request do
  let(:product) { create(:product, weight_oz: 20, length_in: 14, width_in: 11, height_in: 2) }
  let(:items) { [ { product_slug: product.slug, quantity: 2 } ] }
  let(:guam) { ShippingHelpers::GUAM_ADDRESS }
  let(:mainland) { guam.merge(city: "Honolulu", state: "CA", postal_code: "90210") }
  let(:origin) { { name: "Christian", company: "Tåno + Tåsi", phone: "671-555-0199", line1: "1 Harmon Loop", city: "Dededo", state: "GU", postal_code: "96929" } }
  let(:easypost_url) { "https://api.easypost.com/v2/shipments" }
  let(:shipment) do
    { id: "shp_1", messages: [], rates: [
      { id: "rate_ground", carrier: "USPS", service: "GroundAdvantage", rate: "8.20", currency: "USD", delivery_days: 5, shipment_id: "shp_1" },
      { id: "rate_priority", carrier: "USPS", service: "Priority", rate: "14.05", currency: "USD", est_delivery_days: 3, shipment_id: "shp_1" },
      { id: "rate_ups", carrier: "UPS", service: "Ground", rate: "11.00", currency: "USD", delivery_days: nil, shipment_id: "shp_1" },
      { id: "rate_cad", carrier: "Canada", service: "Air", rate: "1.00", currency: "CAD", shipment_id: "shp_1" }
    ] }
  end

  def settings(values)
    StoreSetting.current.update!(shipping_settings: values)
  end

  def quote(address: guam, cart: items)
    post "/api/v1/shipping/quotes", params: { items: cart, address: address }, as: :json
  end

  def options
    response.parsed_body["options"]
  end

  def with_easypost(key: "EZTK_test")
    stub_const("ENV", ENV.to_h.merge("EASYPOST_API_KEY" => key))
    settings(mode: "easypost", origin: origin)
  end

  describe "flat rates" do
    {
      { state: "CA", postal_code: "90210" } => 800,
      { state: "HI", postal_code: "96815" } => 1200,
      { state: "AK", postal_code: "99501" } => 1200,
      { state: "GU", postal_code: "96910" } => 1200,
      { state: "MP", postal_code: "96950" } => 1200,
      { state: "PR", postal_code: "00901" } => 1200,
      { state: "VI", postal_code: "00802" } => 1200,
      { state: "AS", postal_code: "96799" } => 1200,
      { state: "AP", postal_code: "96201", city: "APO" } => 1200,
      { state: "AE", postal_code: "09012", city: "FPO" } => 1200,
      { state: "AA", postal_code: "34002", city: "DPO" } => 1200
    }.each do |address, cents|
      it "quotes the placeholder rate for #{address[:state]} without the network" do
        quote(address: guam.merge(address))
        expect(response).to have_http_status(:ok)
        expect(options.size).to eq(1)
        expect(options.first).to include("label" => "Standard", "amount_cents" => cents, "kind" => "flat", "estimate" => nil, "quote" => kind_of(String))
        expect(WebMock).not_to have_requested(:any, /easypost/)
      end
    end

    it "uses the merchant's saved rate" do
      settings(flat_rates: { guam_cnmi: 1500 })
      quote
      expect(options.first["amount_cents"]).to eq(1500)
    end

    it "makes the cheapest option free over the threshold, and never below it" do
      settings(free_shipping_threshold_cents: 7000)
      quote
      expect(options.first["amount_cents"]).to eq(0)
      quote(cart: [ { product_slug: product.slug, quantity: 1 } ])
      expect(options.first["amount_cents"]).to eq(1200)
    end

    it "offers pickup only with a Guam address, with the merchant's instructions" do
      settings(pickup_enabled: true, pickup_instructions: "Tumon, weekdays.")
      quote
      expect(options.last).to include("label" => "Pick up in Guam", "amount_cents" => 0, "kind" => "pickup", "instructions" => "Tumon, weekdays.")
      quote(address: mainland)
      expect(options.map { |option| option["kind"] }).to eq(%w[flat])
    end
  end

  describe "address rules" do
    {
      { postal_code: "1234" } => [ "postal_code", "Enter a 5-digit ZIP code." ],
      { state: "GU", postal_code: "90210" } => [ "postal_code", "Guam ZIP codes run from 96910 to 96932." ],
      { state: "GU", postal_code: "96950" } => [ "postal_code", "Guam ZIP codes run from 96910 to 96932." ],
      { state: "MP", postal_code: "96910" } => [ "postal_code", "Northern Mariana Islands ZIP codes are 96950, 96951 or 96952." ],
      { state: "AP", postal_code: "96201", city: "San Diego" } => [ "city", "For a military address, the city is APO, FPO or DPO." ],
      { state: "ZZ" } => [ "state", "Choose a state or territory." ],
      { name: " " } => [ "name", "Enter the name of the person receiving this." ],
      { line1: "" } => [ "line1", "Enter a street address or PO box." ],
      { country: "JP" } => [ "country", "We only ship within the U.S. and its territories for now." ]
    }.each do |change, (field, message)|
      it "rejects #{change} with a plain message on #{field}" do
        quote(address: guam.merge(change))
        expect(response).to have_http_status(:unprocessable_content)
        expect(response.parsed_body["error"]).to include("code" => "invalid_address")
        expect(response.parsed_body.dig("error", "details", "fields", field)).to eq(message)
      end
    end

    it "treats a missing or malformed address as invalid, not as a server error" do
      post "/api/v1/shipping/quotes", params: { items: items, address: "nope" }, as: :json
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_address")
      post "/api/v1/shipping/quotes", params: { items: items }, as: :json
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_address")
    end
  end

  describe "the cart" do
    it "answers store_closed before spending an EasyPost call" do
      with_easypost
      allow(StoreSetting).to receive(:sales_open?).and_return(false)
      quote
      expect(response.parsed_body.dig("error", "code")).to eq("store_closed")
      expect(WebMock).not_to have_requested(:any, /easypost/)
    end

    it "rejects unknown, sold-out and unreleased products" do
      quote(cart: [ { product_slug: "missing", quantity: 1 } ])
      expect(response.parsed_body.dig("error", "code")).to eq("unknown_product")
      gone = create(:product, stock_quantity: 0)
      quote(cart: [ { product_slug: gone.slug, quantity: 1 } ])
      expect(response.parsed_body["error"]).to include("code" => "sold_out", "details" => include("product_slug" => gone.slug))
      drop = create(:drop, release_at: nil)
      later = create(:product, kind: "drop", drop: drop)
      quote(cart: [ { product_slug: later.slug, quantity: 1 } ])
      expect(response.parsed_body.dig("error", "code")).to eq("drop_not_live")
    end

    it "applies the same quantity rules as checkout" do
      quote(cart: [ { product_slug: product.slug, quantity: 11 } ])
      expect(response.parsed_body.dig("error", "code")).to eq("quantity_invalid")
      quote(cart: [])
      expect(response.parsed_body.dig("error", "code")).to eq("empty_cart")
    end

    it "limits quotes per IP" do
      13.times { quote }
      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body.dig("error", "code")).to eq("rate_limited")
    end
  end

  describe "live EasyPost rates" do
    before { with_easypost }

    it "returns normalized options, cheapest first, with the handling fee, and drops other currencies" do
      settings(mode: "easypost", origin: origin, handling_fee_cents: 150)
      stub = stub_request(:post, easypost_url).with(basic_auth: [ "EZTK_test", "" ]).to_return(status: 201, body: shipment.to_json)
      quote
      expect(stub).to have_been_requested
      expect(options.map { |option| [ option["label"], option["amount_cents"], option["kind"] ] }).to eq([
        [ "USPS Ground Advantage", 970, "live" ], [ "UPS Ground", 1250, "live" ], [ "USPS Priority", 1555, "live" ]
      ])
      expect(options.first["estimate"]).to eq("About 5 business days after it ships")
      expect(options[2]["estimate"]).to eq("About 3 business days after it ships")
      expect(options[1]["estimate"]).to be_nil
    end

    it "hides provider ids and costs from the customer until the signed token" do
      stub_request(:post, easypost_url).to_return(status: 201, body: shipment.to_json)
      quote
      expect(options.first.keys).to contain_exactly("quote", "label", "amount_cents", "estimate", "kind", "instructions")
    end

    it "keeps only allowed carriers, whatever their case" do
      settings(mode: "easypost", origin: origin, carriers: [ "ups" ])
      stub_request(:post, easypost_url).to_return(status: 201, body: shipment.to_json)
      quote
      expect(options.map { |option| option["label"] }).to eq([ "UPS Ground" ])
    end

    it "sends the address, the summed parcel and customs for Guam" do
      stub = stub_request(:post, easypost_url).with { |request|
        sent = JSON.parse(request.body).fetch("shipment")
        expect(sent["to_address"]).to include("street1" => "123 Marine Corps Drive", "city" => "Hagåtña", "state" => "GU", "zip" => "96910", "country" => "US")
        expect(sent["from_address"]).to include("street1" => "1 Harmon Loop", "state" => "GU", "phone" => "671-555-0199")
        expect(sent["parcel"]).to eq("weight" => 40.0, "length" => 14.0, "width" => 11.0, "height" => 4.0)
        expect(sent["customs_info"]).to include("contents_type" => "merchandise", "customs_certify" => true, "customs_signer" => "Christian", "eel_pfc" => "NOEEI 30.37(a)")
        expect(sent["customs_info"]["customs_items"]).to eq([ { "description" => "Jigsaw puzzle", "quantity" => 2, "weight" => 40.0, "value" => 70.0, "hs_tariff_number" => "950300", "origin_country" => "US", "currency" => "USD" } ])
        true
      }.to_return(status: 201, body: shipment.to_json)
      quote
      expect(stub).to have_been_requested
    end

    it "sends customs for military and territory addresses, but not mainland to mainland" do
      settings(mode: "easypost", origin: origin.merge(state: "CA", postal_code: "90210"))
      bodies = []
      stub_request(:post, easypost_url).with { |request| bodies << JSON.parse(request.body).fetch("shipment"); true }.to_return(status: 201, body: shipment.to_json)
      quote(address: mainland)
      quote(address: guam.merge(state: "AP", city: "APO", postal_code: "96201"))
      quote(address: guam.merge(state: "PR", city: "San Juan", postal_code: "00901"))
      expect(bodies.map { |body| body.key?("customs_info") }).to eq([ false, true, true ])
    end

    it "uses the default parcel for a product with no measurements" do
      plain = create(:product)
      stub = stub_request(:post, easypost_url).with { |request|
        expect(JSON.parse(request.body).dig("shipment", "parcel")).to eq("weight" => 24.0, "length" => 12.0, "width" => 10.0, "height" => 3.0)
        true
      }.to_return(status: 201, body: shipment.to_json)
      quote(cart: [ { product_slug: plain.slug, quantity: 1 } ])
      expect(stub).to have_been_requested
    end

    {
      "a 500" => ->(stub) { stub.to_return(status: 500, body: "{}") },
      "an API error" => ->(stub) { stub.to_return(status: 422, body: { error: { code: "ADDRESS.VERIFY.FAILURE", message: "Bad" } }.to_json) },
      "a timeout" => ->(stub) { stub.to_timeout },
      "a refused connection" => ->(stub) { stub.to_raise(Errno::ECONNREFUSED) },
      "a garbled answer" => ->(stub) { stub.to_return(status: 201, body: "<html>") },
      "rates missing their price" => ->(stub) { stub.to_return(status: 201, body: { id: "shp", rates: [ { id: "r", carrier: "USPS", currency: "USD" } ] }.to_json) },
      "no rates" => ->(stub) { stub.to_return(status: 201, body: { id: "shp", rates: [] }.to_json) }
    }.each do |name, failure|
      it "falls back to flat rates on #{name}, and says so" do
        failure.call(stub_request(:post, easypost_url))
        allow(Rails.logger).to receive(:error)
        quote
        expect(response).to have_http_status(:ok)
        expect(options.first).to include("label" => "Standard", "amount_cents" => 1200, "kind" => "flat_fallback")
        expect(Rails.logger).to have_received(:error).with(/\AEASYPOST_RATES_FALLBACK reason=\S+ zone=guam_cnmi\z/)
      end
    end

    it "never logs the address when it falls back" do
      stub_request(:post, easypost_url).to_timeout
      lines = []
      allow(Rails.logger).to receive(:error) { |line| lines << line }
      quote
      expect(lines.join).not_to include("Marine Corps")
    end

    it "falls back without calling EasyPost when the origin address is incomplete" do
      settings(mode: "easypost", origin: { line1: "" })
      quote
      expect(options.first["kind"]).to eq("flat_fallback")
      expect(WebMock).not_to have_requested(:any, /easypost/)
    end

    it "makes the cheapest live rate free over the threshold, keeping its label and ids" do
      settings(mode: "easypost", origin: origin, free_shipping_threshold_cents: 1000)
      stub_request(:post, easypost_url).to_return(status: 201, body: shipment.to_json)
      quote
      expect(options.first).to include("label" => "USPS Ground Advantage", "amount_cents" => 0, "kind" => "live")
      expect(options.second["amount_cents"]).to eq(1100)
      saved = Shipping::QuoteToken.read!(options.first["quote"]).shipping_method
      expect(saved).to include("provider_rate_id" => "rate_ground", "cost_cents" => 820)
    end
  end

  it "uses flat rates when EasyPost is selected but no key is set" do
    stub_const("ENV", ENV.to_h.except("EASYPOST_API_KEY"))
    settings(mode: "easypost", origin: origin)
    quote
    expect(options.first["kind"]).to eq("flat")
    expect(WebMock).not_to have_requested(:any, /easypost/)
  end

  it "uses flat rates when a key is set but the merchant chose flat" do
    stub_const("ENV", ENV.to_h.merge("EASYPOST_API_KEY" => "EZTK_test"))
    settings(mode: "flat", origin: origin)
    quote
    expect(options.first["kind"]).to eq("flat")
    expect(WebMock).not_to have_requested(:any, /easypost/)
  end
end
