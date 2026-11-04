require "rails_helper"

RSpec.describe "EasyPost webhooks", type: :request do
  let(:secret) { "whsec_é_test" }
  let(:order) do
    checkout_call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: create(:product).slug, quantity: 1 } ]).order.tap do |row|
      row.update!(status: "paid", label_status: "bought", label_shipment_id: "shp_1", tracking_number: "TRACK1", tracking_status: "pre_transit", tracking_status_at: 2.days.ago)
    end
  end
  before { stub_const("ENV", ENV.to_h.merge("EASYPOST_WEBHOOK_SECRET" => secret)) }

  def event(id: "evt_1", description: "tracker.updated", result: {})
    { id: id, object: "Event", mode: "test", description: description, result: { id: "trk_1", object: "Tracker", tracking_code: "TRACK1", status: "in_transit", shipment_id: "shp_1", updated_at: 1.hour.ago.iso8601 }.merge(result) }
  end

  def signature(body, key: secret)
    "hmac-sha256-hex=#{OpenSSL::HMAC.hexdigest('SHA256', key.unicode_normalize(:nfkd), body)}"
  end

  def deliver(payload, header: nil)
    body = payload.is_a?(String) ? payload : payload.to_json
    post "/api/v1/webhooks/easypost", params: body, headers: { "CONTENT_TYPE" => "application/json", "X-Hmac-Signature" => header || signature(body) }
  end

  it "records a signed update and shows it on the order" do
    order
    deliver(event)
    expect(response).to have_http_status(:ok)
    expect(order.reload.tracking_status).to eq("in_transit")
    expect(ShippingEvent.find_by(event_id: "evt_1")).to have_attributes(order_id: order.id, status: "in_transit", tracking_code: "TRACK1", shipment_id: "shp_1")
  end

  it "rejects a missing or wrong signature, and records nothing" do
    order
    deliver(event, header: "hmac-sha256-hex=bad")
    expect(response).to have_http_status(:bad_request)
    body = event.to_json
    post "/api/v1/webhooks/easypost", params: body, headers: { "CONTENT_TYPE" => "application/json" }
    expect(response).to have_http_status(:bad_request)
    deliver(event, header: signature(event.to_json, key: "other"))
    expect(response).to have_http_status(:bad_request)
    expect(ShippingEvent.count).to eq(0)
    expect(order.reload.tracking_status).to eq("pre_transit")
  end

  it "refuses everything while no secret is set" do
    stub_const("ENV", ENV.to_h.except("EASYPOST_WEBHOOK_SECRET"))
    deliver(event, header: "hmac-sha256-hex=anything")
    expect(response).to have_http_status(:bad_request)
  end

  it "processes a repeated event once" do
    order
    2.times { deliver(event); expect(response).to have_http_status(:ok) }
    expect(ShippingEvent.count).to eq(1)
  end

  it "keeps the newest status when events arrive out of order" do
    order
    deliver(event(id: "evt_new", result: { status: "delivered", updated_at: 1.hour.ago.iso8601 }))
    deliver(event(id: "evt_old", result: { status: "in_transit", updated_at: 1.day.ago.iso8601 }))
    expect(response).to have_http_status(:ok)
    expect(order.reload.tracking_status).to eq("delivered")
    expect(ShippingEvent.count).to eq(2)
  end

  it "acknowledges and records an event that matches no order" do
    deliver(event(id: "evt_lost", result: { shipment_id: "shp_other", tracking_code: "OTHER" }))
    expect(response).to have_http_status(:ok)
    expect(ShippingEvent.find_by(event_id: "evt_lost")).to have_attributes(order_id: nil, tracking_code: "OTHER")
  end

  it "matches a label's tracking code when the event has no shipment" do
    order
    deliver(event(result: { shipment_id: nil }))
    expect(order.reload.tracking_status).to eq("in_transit")
  end

  it "never matches a manually entered tracking number" do
    order.update!(label_status: nil, label_shipment_id: nil)
    deliver(event(result: { shipment_id: nil }))
    expect(order.reload.tracking_status).to eq("pre_transit")
    expect(ShippingEvent.last.order_id).to be_nil
  end

  it "acknowledges other signed events without recording them" do
    deliver(event(description: "batch.created"))
    expect(response).to have_http_status(:ok)
    expect(ShippingEvent.count).to eq(0)
  end

  it "survives odd signed bodies" do
    deliver("[1,2]")
    expect(response).to have_http_status(:ok)
    deliver({ id: "evt_empty", description: "tracker.updated", result: nil })
    expect(response).to have_http_status(:ok)
    expect(ShippingEvent.find_by(event_id: "evt_empty").order_id).to be_nil
  end
end
