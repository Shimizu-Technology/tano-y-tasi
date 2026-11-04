require "rails_helper"

RSpec.describe "Orders and simulated payments", type: :request do
  let(:product) { create(:product) }
  let(:order) { checkout_call(email: "alice@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 } ]).order }

  it "shows only public order fields with masked email and snapshots" do
    get "/api/v1/orders/#{order.token}"
    expect(response).to have_http_status(:ok)
    data = response.parsed_body.fetch("order")
    expect(data["email_masked"]).to eq("a•••@example.com")
    expect(data["items"].first).to include("product_slug" => product.slug, "quantity" => 2, "unit_price_cents" => 3500)
    expect(data["total_cents"]).to eq(7000)
    expect(data.keys).not_to include("email", "shipping", "idempotency_key", "provider_session_id", "request_fingerprint")
  end

  it "completes simulated checkout twice without a second stock decrement" do
    2.times do
      post "/api/v1/simulated_payments/#{order.token}/complete"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.dig("order", "status")).to eq("paid")
    end
    get "/api/v1/orders/#{order.token}"
    expect(response.parsed_body.dig("order", "paid_at")).to be_present
    expect(product.reload.stock_quantity).to eq(48)
    expect(PaymentEvent.count).to eq(1)
  end

  %w[orders simulated_payments].each do |prefix|
    it "cancels through #{prefix} idempotently" do
      2.times do
        post "/api/v1/#{prefix}/#{order.token}/cancel"
        expect(response).to have_http_status(:ok)
        expect(response.parsed_body.dig("order", "status")).to eq("canceled")
      end
      expect(product.reload.stock_quantity).to eq(50)
    end
  end

  it "does not cancel a paid order" do
    Payments::Complete.call(order)
    post "/api/v1/orders/#{order.token}/cancel"
    expect(response.parsed_body.dig("order", "status")).to eq("paid")
    expect(product.reload.stock_quantity).to eq(48)
  end

  it "hides simulated routes when the provider is inactive" do
    order
    allow(Rails.application.config.x).to receive(:payment_provider).and_return("stripe")
    %w[complete cancel].each do |action|
      post "/api/v1/simulated_payments/#{order.token}/#{action}"
      expect(response).to have_http_status(:not_found)
    end
  end

  it "does not complete Stripe orders through the simulated endpoint" do
    order.update!(provider: "stripe")
    post "/api/v1/simulated_payments/#{order.token}/complete"
    expect(response).to have_http_status(:not_found)
  end

  it "returns JSON 404 for every missing token route" do
    get "/api/v1/orders/missing"
    expect(response).to have_http_status(:not_found)
    %w[orders/missing/cancel simulated_payments/missing/complete simulated_payments/missing/cancel].each do |route|
      post "/api/v1/#{route}"
      expect(response).to have_http_status(:not_found)
      expect(response.parsed_body.dig("error", "code")).to eq("not_found")
    end
  end
  it "redacts bearer tokens from the structured request log" do
    buffer = StringIO.new
    allow(Lograge).to receive(:logger).and_return(ActiveSupport::Logger.new(buffer))
    get "/api/v1/orders/#{order.token}"
    expect(buffer.string).to include("/api/v1/orders/[FILTERED]")
    expect(buffer.string).not_to include(order.token)
  end
end
