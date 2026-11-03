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
  before do
    stub_const("ENV", ENV.to_h.merge("STRIPE_WEBHOOK_SECRET" => secret))
    allow(Stripe::Checkout::Session).to receive(:expire).and_return(Stripe::StripeObject.construct_from(status: "expired"))
  end

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
    expect(order.provider_session_closed_at).to be_present
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
      expect(order.provider_session_closed_at).to be_present
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
    expect(order.provider_session_closed_at).to be_present
  end

  it "records an expiry webhook as closed even after a prior cancel" do
    Orders::Release.call(order)
    expect(Stripe::Checkout::Session).not_to receive(:expire)
    2.times { send_event("checkout.session.expired") }
    expect(response).to have_http_status(:ok)
    expect(order.reload.status).to eq("canceled")
    expect(order.provider_session_closed_at).to be_present
    expect(product.reload.stock_quantity).to eq(50)
    expect(InventoryMovement.where(order: order, reason: "release").count).to eq(1)
  end

  it "retains closure work after async failure if Stripe is unreachable" do
    allow(Stripe::Checkout::Session).to receive(:expire).and_raise(Stripe::APIConnectionError.new("offline"))
    send_event("checkout.session.async_payment_failed")
    expect(response).to have_http_status(:ok)
    expect(order.reload.status).to eq("canceled")
    expect(order.provider_session_closed_at).to be_nil
    expect(product.reload.stock_quantity).to eq(50)
    allow(Stripe::Checkout::Session).to receive(:expire).and_return(Stripe::StripeObject.construct_from(status: "expired"))
    Payments::CloseReleasedSessions.call
    expect(order.reload.provider_session_closed_at).to be_present
  end

  it "records a charged amount that does not match the order for review and releases its stock" do
    send_event(object: session.merge(amount_total: 1))
    expect(response).to have_http_status(:ok)
    expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "amount_mismatch", provider_payment_intent_id: "pi_test")
    expect(order.paid_at).to be_present
    expect(product.reload.stock_quantity).to eq(50)
  end

  it "records a payment from a different session for review" do
    send_event(object: session.merge(id: "cs_wrong"))
    expect(response).to have_http_status(:ok)
    expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "session_mismatch")
  end

  it "ignores an expiry from a different session" do
    send_event("checkout.session.expired", object: session.merge(id: "cs_wrong"))
    expect(response).to have_http_status(:ok)
    expect(order.reload.status).to eq("pending_payment")
    expect(product.reload.stock_quantity).to eq(49)
  end

  it "acknowledges events for sessions that are not ours" do
    send_event(object: session.merge(metadata: { order_token: "someone-else" }))
    expect(response).to have_http_status(:ok)
    send_event(id: "evt_no_metadata", object: session.except(:metadata))
    expect(response).to have_http_status(:ok)
    expect(order.reload.status).to eq("pending_payment")
  end

  context "after payment" do
    before { send_event }

    def refund_event(amount, id:)
      send_event("charge.refunded", id: id, object: { id: "ch_test", payment_intent: "pi_test", amount_refunded: amount })
    end

    it "restocks a full refund of an unshipped order exactly once" do
      2.times { refund_event(3500, id: "evt_refund") }
      refund_event(3500, id: "evt_refund_again")
      expect(response).to have_http_status(:ok)
      expect(order.reload).to have_attributes(status: "refunded", refunded_cents: 3500)
      expect(order.refunded_at).to be_present
      expect(product.reload.stock_quantity).to eq(50)
      expect(InventoryMovement.where(order: order, reason: "refund_restock").count).to eq(1)
      expect(order.email_deliveries.where(kind: "order_refunded").count).to eq(1)
    end

    it "keeps stock out for a shipped order" do
      order.update!(fulfillment_status: "fulfilled", fulfilled_at: Time.current)
      refund_event(3500, id: "evt_refund")
      expect(order.reload.status).to eq("refunded")
      expect(product.reload.stock_quantity).to eq(49)
    end

    it "tracks a partial refund without changing the order status" do
      refund_event(1000, id: "evt_partial")
      expect(order.reload).to have_attributes(status: "paid", refunded_cents: 1000)
      expect(product.reload.stock_quantity).to eq(49)
      refund_event(500, id: "evt_older")
      expect(order.reload.refunded_cents).to eq(1000)
    end

    it "acknowledges refunds for payments that are not ours" do
      send_event("charge.refunded", id: "evt_other", object: { id: "ch_other", payment_intent: "pi_other", amount_refunded: 100 })
      expect(response).to have_http_status(:ok)
      expect(order.reload.refunded_cents).to eq(0)
    end

    it "records disputes and alerts admins" do
      User.create!(clerk_id: "admin", email: "admin@example.com")
      send_event("charge.dispute.created", id: "evt_dispute", object: { id: "dp_test", payment_intent: "pi_test", status: "needs_response" })
      expect(order.reload.dispute_status).to eq("needs_response")
      expect(order.email_deliveries.where(kind: "admin_attention").count).to eq(1)
      send_event("charge.dispute.closed", id: "evt_won", object: { id: "dp_test", payment_intent: "pi_test", status: "won" })
      expect(order.reload.dispute_status).to eq("won")
    end
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
