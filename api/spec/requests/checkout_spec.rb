require "rails_helper"

RSpec.describe "Checkout", type: :request do
  let(:product) { create(:product) }
  let(:payload) { { email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 1 } ] } }
  def submit(attributes = {})
    post "/api/v1/checkout", params: payload.merge(attributes), as: :json
  end
  def expect_error(code, status = :unprocessable_content)
    expect(response).to have_http_status(status)
    expect(response.parsed_body["error"]).to include("code" => code, "message" => kind_of(String), "details" => kind_of(Hash))
  end

  it "returns 201, then 200 for an identical retry and 409 on conflict" do
    submit
    expect(response).to have_http_status(:created)
    first = response.parsed_body
    expect(first["payment_url"]).to end_with("/checkout/simulated/#{first.dig('order', 'token')}")
    expect(first.dig("order", "status")).to eq("pending_payment")
    submit
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq(first)
    submit(email: "b@example.com")
    expect_error("idempotency_conflict", :conflict)
    expect(product.reload.stock_quantity).to eq(49)
  end

  { "invalid_email" => { email: "wrong" }, "empty_cart" => { items: [] },
    "unknown_product" => { items: [ { product_slug: "missing", quantity: 1 } ] },
    "quantity_invalid" => { items: [ { product_slug: "irrelevant", quantity: 0 } ] } }.each do |code, attributes|
    it "returns #{code}" do
      submit(attributes)
      expect_error(code)
    end
  end

  [ 0, -1, 1.5, "2", true, nil, 11 ].each do |quantity|
    it "rejects invalid quantity #{quantity.inspect}" do
      submit(items: [ { product_slug: product.slug, quantity: quantity } ])
      expect_error("quantity_invalid")
    end
  end

  it "rejects malformed items, email, key, and JSON" do
    submit(items: { product_slug: product.slug, quantity: 1 })
    expect_error("quantity_invalid")
    submit(email: [ "a@example.com" ])
    expect_error("invalid_email")
    submit(idempotency_key: nil)
    expect_error("malformed", :bad_request)
    post "/api/v1/checkout", params: "{broken", headers: { "CONTENT_TYPE" => "application/json" }
    expect_error("malformed", :bad_request)
  end

  it "returns sold_out and insufficient_stock without creating orders" do
    product.update!(stock_quantity: 0)
    submit
    expect_error("sold_out")
    expect(response.parsed_body.dig("error", "details", "available")).to eq(0)
    product.update!(stock_quantity: 1)
    submit(items: [ { product_slug: product.slug, quantity: 2 } ])
    expect_error("insufficient_stock")
    expect(response.parsed_body.dig("error", "details", "available")).to eq(1)
    expect(Order.count).to eq(0)
  end

  it "returns drop_not_live with release_at" do
    product.update!(kind: "drop", drop: create(:drop, release_at: 1.day.from_now))
    submit
    expect_error("drop_not_live")
    expect(response.parsed_body.dig("error", "details", "release_at")).to eq(product.drop.release_at.iso8601)
  end

  it "returns limit_exceeded with customer limit and prior quantity" do
    product.update!(kind: "drop", drop: create(:drop))
    submit(items: [ { product_slug: product.slug, quantity: 3 } ])
    expect_error("limit_exceeded")
    expect(response.parsed_body.dig("error", "details")).to eq("product_slug" => product.slug, "limit" => 2, "already_purchased" => 0)
  end

  it "returns 503 and preserves the hold on a transient gateway failure" do
    allow(Payments::Gateway).to receive(:create_session).and_raise(Stripe::APIError, "failed")
    submit
    expect_error("payment_unavailable", :service_unavailable)
    expect(response.parsed_body.dig("error", "details")).to eq("retry" => "same_key")
    expect(product.reload.stock_quantity).to eq(49)
    expect(Order.last.status).to eq("pending_payment")
  end

  it "throttles checkout at ten requests per minute with a JSON error" do
    11.times { submit(email: "bad") }
    expect_error("rate_limited", :too_many_requests)
    expect(response.headers["Retry-After"]).to be_present
  end

  it "ignores client-supplied prices and status" do
    submit(total_cents: 1, status: "paid", items: [ { product_slug: product.slug, quantity: 1, unit_price_cents: 1 } ])
    expect(response).to have_http_status(:created)
    expect(Order.last.total_cents).to eq(3500)
    expect(Order.last.status).to eq("pending_payment")
  end
  it "rejects non-object cart items rather than dropping them from the cart" do
    [ "wrong", 2, [ 1 ] ].each do |item|
      submit(items: [ item ])
      expect_error("quantity_invalid")
    end
  end

  it "keeps a failed checkout unavailable on retries without reserving again" do
    allow(Payments::Gateway).to receive(:create_session).and_raise(Stripe::InvalidRequestError.new("invalid", nil))
    2.times do
      submit
      expect_error("payment_unavailable", :service_unavailable)
    end
    expect(product.reload.stock_quantity).to eq(50)
    expect(Order.count).to eq(1)
    expect(Payments::Gateway).to have_received(:create_session).once
  end
  it "shares the throttle with trailing-slash and format route variants" do
    paths = [ "/api/v1/checkout", "/api/v1/checkout/", "/api/v1/checkout.json" ]
    11.times do |index|
      post paths[index % paths.size], params: payload.merge(email: "bad"), as: :json
    end
    expect_error("rate_limited", :too_many_requests)
  end
end
