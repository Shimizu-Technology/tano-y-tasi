require "rails_helper"

RSpec.describe "Stripe checkout recovery", type: :request do
  let(:product) { create(:product, stock_quantity: 5) }
  let(:payload) { { email: "buyer@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 } ] } }
  let(:session) { Stripe::StripeObject.construct_from(id: "cs_recovery", url: "https://checkout.stripe.com/recovery") }

  before { allow(Payments::Gateway).to receive(:provider).and_return("stripe") }

  def submit
    post "/api/v1/checkout", params: payload, as: :json
  end

  [ Stripe::APIConnectionError.new("offline"), Stripe::APIError.new("unavailable"),
    Stripe::RateLimitError.new("busy"), Timeout::Error.new("timeout"), IOError.new("interrupted") ].each do |error|
    it "keeps the reservation and retries the same order after #{error.class}" do
      attempts = []
      allow(Stripe::Checkout::Session).to receive(:create) do |params, options|
        order = Order.find_by!(idempotency_key: payload[:idempotency_key])
        expect(order.provider_session_expires_at.to_i).to eq(params[:expires_at])
        expect(order.expires_at).to eq(order.provider_session_expires_at)
        attempts << [ params, options ]
        raise error if attempts.size == 1
        session
      end
      submit
      expect(response).to have_http_status(:service_unavailable)
      expect(response.parsed_body.dig("error", "code")).to eq("payment_unavailable")
      expect(response.parsed_body.dig("error", "message")).to include("same idempotency_key")
      expect(Order.last.status).to eq("pending_payment")
      expect(product.reload.stock_quantity).to eq(3)
      travel 20.seconds
      submit
      expect(response).to have_http_status(:ok)
      expect(Order.count).to eq(1)
      expect(attempts.size).to eq(2)
      expect(attempts.last).to eq(attempts.first)
      expect(Order.last.provider_session_id).to eq("cs_recovery")
      expect(product.reload.stock_quantity).to eq(3)
      expect(InventoryMovement.count).to eq(1)
    end
  end

  [ Stripe::InvalidRequestError.new("invalid", nil), Stripe::IdempotencyError.new("mismatched") ].each do |error|
    it "releases exactly once after definitive #{error.class} and asks for a new checkout" do
      allow(Stripe::Checkout::Session).to receive(:create).and_raise(error)
      2.times do
        submit
        expect(response).to have_http_status(:service_unavailable)
        expect(response.parsed_body.dig("error", "message")).to include("start a new checkout")
      end
      expect(Stripe::Checkout::Session).to have_received(:create).once
      expect(Order.last.status).to eq("canceled")
      expect(product.reload.stock_quantity).to eq(5)
      expect(InventoryMovement.where(reason: "release").count).to eq(1)
    end
  end

  it "replays identical parameters after a crash between Stripe create and session persistence" do
    attempts = []
    allow(Stripe::Checkout::Session).to receive(:create) do |params, options|
      attempts << [ params, options ]
      session
    end
    allow(Payments::Gateway).to receive(:create_session).and_wrap_original do |method, order|
      result = method.call(order)
      # Stripe returned successfully, but the worker dies before persisting it.
      raise "worker crashed after provider create" if attempts.size == 1
      result
    end
    expect { Orders::Checkout.call(payload) }.to raise_error("worker crashed after provider create")
    order = Order.find_by!(idempotency_key: payload[:idempotency_key])
    expect(order.provider_session_id).to be_nil
    expect(order.provider_session_expires_at).to be_present
    product.update!(name: "Changed catalog name", price_cents: 9900)
    travel 25.seconds
    recovered = Orders::Checkout.call(payload).order
    expect(attempts.last).to eq(attempts.first)
    expect(attempts.last.first[:line_items]).to eq([
      { quantity: 2, price_data: { currency: "usd", unit_amount: 3500, product_data: { name: "Håfa Adai from Tumon Bay" } } }
    ])
    expect(recovered).to eq(order)
    expect(recovered.provider_session_id).to eq("cs_recovery")
    expect(product.reload.stock_quantity).to eq(3)
  end

  it "releases a transiently failed reservation after its hold and grace period" do
    allow(Stripe::Checkout::Session).to receive(:create).and_raise(Stripe::APIConnectionError.new("offline"))
    submit
    travel 37.minutes
    Orders::ReleaseExpired.call
    expect(Order.last.status).to eq("expired")
    expect(product.reload.stock_quantity).to eq(5)
    submit
    expect(response).to have_http_status(:service_unavailable)
    expect(response.parsed_body.dig("error", "message")).to include("start a new checkout")
    expect(Stripe::Checkout::Session).to have_received(:create).once
  end
end
