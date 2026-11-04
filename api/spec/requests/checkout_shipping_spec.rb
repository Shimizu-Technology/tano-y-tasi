require "rails_helper"

RSpec.describe "Checkout with shipping", type: :request do
  let(:product) { create(:product) }
  let(:items) { [ { product_slug: product.slug, quantity: 2 } ] }
  let(:guam) { ShippingHelpers::GUAM_ADDRESS }

  def quoted(address: guam)
    post "/api/v1/shipping/quotes", params: { items: items, address: address }, as: :json
    response.parsed_body["options"]
  end

  def submit(shipping, key: SecureRandom.uuid, email: "a@example.com", cart: items)
    post "/api/v1/checkout", params: { email: email, idempotency_key: key, items: cart, shipping: shipping }, as: :json
  end

  def error_code
    response.parsed_body.dig("error", "code")
  end

  it "charges what the server quoted, and saves the address in the admin's shape" do
    submit({ quote: quoted.first["quote"], address: guam })
    expect(response).to have_http_status(:created)
    order = Order.last
    expect(order).to have_attributes(subtotal_cents: 7000, shipping_cents: 1200, total_cents: 8200, tax_cents: 0, fulfillment_method: "ship")
    expect(order.shipping).to eq("name" => "A Buyer", "phone" => "671-555-0100",
      "address" => { "line1" => "123 Marine Corps Drive", "line2" => nil, "city" => "Hagåtña", "state" => "GU", "postal_code" => "96910", "country" => "US" })
    expect(order.shipping_method).to include("label" => "Standard", "kind" => "flat")
    expect(product.reload.stock_quantity).to eq(48)
  end

  it "ignores any amount the client sends" do
    token = quoted.first["quote"]
    post "/api/v1/checkout", params: { email: "a@example.com", idempotency_key: "k1", items: items, shipping_cents: 1, total_cents: 1, shipping: { quote: token, address: guam, amount_cents: 1 } }, as: :json
    expect(Order.last).to have_attributes(shipping_cents: 1200, total_cents: 8200)
  end

  it "requires a shipping choice for a new order" do
    submit(nil)
    expect(error_code).to eq("shipping_required")
    submit("nope")
    expect(error_code).to eq("shipping_required")
    expect(Order.count).to eq(0)
  end

  it "rejects a tampered or foreign token" do
    token = quoted.first["quote"]
    data, digest = token.split("--")
    forged = Base64.strict_encode64(Base64.decode64(data).sub("1200", "0001"))
    submit({ quote: "#{forged}--#{digest}", address: guam })
    expect(response).to have_http_status(:unprocessable_content)
    expect(error_code).to eq("shipping_quote_invalid")
    other = Rails.application.message_verifier("other").generate({ amount_cents: 1 }, purpose: :shipping_quote)
    submit({ quote: other, address: guam })
    expect(error_code).to eq("shipping_quote_invalid")
    expect(Order.count).to eq(0)
    expect(product.reload.stock_quantity).to eq(50)
  end

  it "rejects a quote for another address or another cart" do
    token = quoted.first["quote"]
    submit({ quote: token, address: guam.merge(line1: "9 Other Road") })
    expect(error_code).to eq("shipping_quote_invalid")
    submit({ quote: token, address: guam }, cart: [ { product_slug: product.slug, quantity: 1 } ])
    expect(error_code).to eq("shipping_quote_invalid")
    expect(Order.count).to eq(0)
  end

  it "treats spacing and case in the address as the same address" do
    token = quoted.first["quote"]
    submit({ quote: token, address: guam.merge(line1: "  123  MARINE corps Drive ", state: "gu") })
    expect(response).to have_http_status(:created)
  end

  it "rejects a quote after the price changes" do
    token = quoted.first["quote"]
    product.update!(price_cents: 1000)
    submit({ quote: token, address: guam })
    expect(error_code).to eq("shipping_quote_invalid")
  end

  it "expires a quote after 30 minutes, without touching stock" do
    token = quoted.first["quote"]
    travel 31.minutes
    submit({ quote: token, address: guam })
    expect(response).to have_http_status(:unprocessable_content)
    expect(error_code).to eq("shipping_quote_expired")
    expect(product.reload.stock_quantity).to eq(50)
  end

  it "lets a retry of a held checkout through after its quote expires" do
    allow(Payments::Gateway).to receive(:create_session).and_raise(Stripe::APIConnectionError.new("offline"))
    allow(Payments::Gateway).to receive(:provider).and_return("simulated")
    token = quoted.first["quote"]
    submit({ quote: token, address: guam }, key: "held")
    expect(response.parsed_body.dig("error", "details", "retry")).to eq("same_key")
    allow(Payments::Gateway).to receive(:create_session).and_call_original
    travel 20.minutes
    submit({ quote: token, address: guam }, key: "held")
    expect(response).to have_http_status(:created).or have_http_status(:ok)
    expect(product.reload.stock_quantity).to eq(48)
  end

  it "treats a different address or option on the same key as a conflict" do
    options = quoted
    submit({ quote: options.first["quote"], address: guam }, key: "same")
    other_address = guam.merge(line1: "9 Other Road")
    submit({ quote: quoted(address: other_address).first["quote"], address: other_address }, key: "same")
    expect(response).to have_http_status(:conflict)
    expect(error_code).to eq("idempotency_conflict")
    expect(product.reload.stock_quantity).to eq(48)
  end

  it "treats a re-quote of the same option on the same key as the same request" do
    submit({ quote: quoted.first["quote"], address: guam }, key: "same")
    first = response.parsed_body
    travel 1.minute
    submit({ quote: quoted.first["quote"], address: guam }, key: "same")
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq(first)
  end

  it "checks stock and limits before the quote, so the customer hears about the item first" do
    product.update!(stock_quantity: 0)
    token = shipping_for(items, amount_cents: 1200)[:quote]
    submit({ quote: token, address: guam })
    expect(error_code).to eq("sold_out")
  end

  it "records a pickup order, with its instructions and no shipping charge" do
    StoreSetting.current.update!(shipping_settings: { pickup_enabled: true, pickup_instructions: "Tumon, weekdays." })
    pickup = quoted.find { |option| option["kind"] == "pickup" }
    submit({ quote: pickup["quote"], address: guam })
    expect(Order.last).to have_attributes(fulfillment_method: "pickup", shipping_cents: 0, total_cents: 7000)
    expect(Order.last.shipping_method).to include("instructions" => "Tumon, weekdays.", "kind" => "pickup")
  end

  describe "the public order" do
    it "shows the lines but no address or provider detail" do
      submit(shipping_for(items, amount_cents: 900, kind: "live", label: "USPS Ground Advantage", provider_shipment_id: "shp_secret", provider_rate_id: "rate_secret", cost_cents: 700))
      token = response.parsed_body.dig("order", "token")
      get "/api/v1/orders/#{token}"
      data = response.parsed_body["order"]
      expect(data).to include("subtotal_cents" => 7000, "shipping_cents" => 900, "tax_cents" => 0, "total_cents" => 7900, "fulfillment_method" => "ship")
      expect(data["shipping_method"]).to eq("label" => "USPS Ground Advantage", "estimate" => nil)
      expect(response.body).not_to include("shp_secret", "rate_secret", "Marine Corps", "\"cost_cents\"")
    end
  end

  describe "an order with nothing to charge" do
    let(:free) { create(:product, price_cents: 0) }
    let(:items) { [ { product_slug: free.slug, quantity: 1 } ] }

    it "completes without calling Stripe, and takes stock once" do
      allow(Payments::Gateway).to receive(:provider).and_return("stripe")
      expect(Stripe::Checkout::Session).not_to receive(:create)
      shipping = shipping_for(items)
      submit(shipping, key: "free")
      expect(response).to have_http_status(:created)
      order = Order.last
      expect(order).to have_attributes(status: "paid", total_cents: 0, charged_cents: 0)
      expect(response.parsed_body["payment_url"]).to eq("http://localhost:5181/orders/#{order.token}?from=checkout")
      submit(shipping, key: "free")
      expect(response).to have_http_status(:ok)
      expect(free.reload.stock_quantity).to eq(49)
      expect(InventoryMovement.where(product: free).count).to eq(1)
    end
  end
end
