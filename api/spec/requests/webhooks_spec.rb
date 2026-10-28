require "rails_helper"

RSpec.describe "Stripe webhooks", type: :request do
  let(:product) { create(:product) }
  let(:order) do
    Orders::Checkout.call(email: "a@example.com", idempotency_key: SecureRandom.uuid,
      items: [ { product_slug: product.slug, quantity: 1 } ]).order.tap { |row| row.update!(provider: "stripe", provider_session_id: "cs_test") }
  end
  let(:secret) { "whsec_test_only" }
  let(:session) do
    { id: "cs_test", metadata: { order_token: order.token }, payment_intent: "pi_test", payment_status: "paid", amount_total: 3500, currency: "usd",
      collected_information: { shipping_details: { name: "A Buyer", address: { country: "GU" } } } }
  end
  before { stub_const("ENV", ENV.to_h.merge("STRIPE_WEBHOOK_SECRET" => secret)) }

  def send_event(type = "checkout.session.completed", id: "evt_test", signature: nil, object: session)
    body = { id: id, object: "event", type: type, data: { object: object } }.to_json
    timestamp = Time.current
    signature ||= Stripe::Webhook::Signature.generate_header(timestamp, Stripe::Webhook::Signature.compute_signature(timestamp, body, secret))
    post "/api/v1/webhooks/stripe", params: body, headers: { "CONTENT_TYPE" => "application/json", "Stripe-Signature" => signature }
  end

  it "verifies a real signature and processes duplicates once" do
    2.times { send_event; expect(response).to have_http_status(:ok) }
    expect(order.reload.status).to eq("paid")
    expect(order.provider_payment_intent_id).to eq("pi_test")
    expect(order.shipping.dig("address", "country")).to eq("GU")
    expect(product.reload.stock_quantity).to eq(49)
    expect(PaymentEvent.count).to eq(1)
  end

  it "rejects an invalid signature with 400 and no state change" do
    send_event(signature: "t=0,v1=invalid")
    expect(response).to have_http_status(:bad_request)
    expect(response.parsed_body.dig("error", "code")).to eq("malformed")
    expect(order.reload.status).to eq("pending_payment")
    expect(PaymentEvent.count).to eq(0)
  end

  it "rejects a missing signature" do
    post "/api/v1/webhooks/stripe", params: "{}", headers: { "CONTENT_TYPE" => "application/json" }
    expect(response).to have_http_status(:bad_request)
  end

  { "checkout.session.expired" => "expired", "checkout.session.async_payment_failed" => "canceled" }.each do |event_type, status|
    it "releases stock for #{event_type} exactly once" do
      2.times { send_event(event_type) }
      expect(response).to have_http_status(:ok)
      expect(order.reload.status).to eq(status)
      expect(product.reload.stock_quantity).to eq(50)
    end
  end

  it "acknowledges ignored event types" do
    send_event("payment_intent.created", object: { id: "pi_other" })
    expect(response).to have_http_status(:ok)
    expect(PaymentEvent.last.processed_at).to be_present
  end

  it "does not mark unpaid completed sessions paid" do
    send_event(object: session.merge(payment_status: "unpaid"))
    expect(response).to have_http_status(:ok)
    expect(order.reload.status).to eq("pending_payment")
  end

  it "rejects mismatched amounts and session IDs" do
    send_event(object: session.merge(amount_total: 1))
    expect(response).to have_http_status(:bad_request)
    send_event(object: session.merge(id: "cs_wrong"))
    expect(response).to have_http_status(:bad_request)
    expect(order.reload.status).to eq("pending_payment")
  end

  it "does not release stock when an expiry event follows completion" do
    send_event
    send_event("checkout.session.expired", id: "evt_expired")
    expect(order.reload.status).to eq("paid")
    expect(product.reload.stock_quantity).to eq(49)
  end
  it "handles async payment success through the same paid transition" do
    send_event("checkout.session.completed", object: session.merge(payment_status: "unpaid"))
    send_event("checkout.session.async_payment_succeeded", id: "evt_async")
    expect(response).to have_http_status(:ok)
    expect(order.reload.status).to eq("paid")
    expect(product.reload.stock_quantity).to eq(49)
  end
end
