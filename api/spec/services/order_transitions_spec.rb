require "rails_helper"

RSpec.describe "Order transitions" do
  let(:product) { create(:product, stock_quantity: 3) }
  let(:order) { Orders::Checkout.call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 } ]).order }

  it "releases canceled orders exactly once" do
    order
    2.times { Orders::Release.call(order) }
    expect(product.reload.stock_quantity).to eq(3)
    expect(order.reload.status).to eq("canceled")
    expect(InventoryMovement.where(order: order, reason: "release").count).to eq(1)
  end

  it "does not release a paid order" do
    Payments::Complete.call(order)
    Orders::Release.call(order)
    expect(order.reload.status).to eq("paid")
    expect(product.reload.stock_quantity).to eq(1)
  end

  it "waits five minutes beyond expiry and releases only once" do
    order.update!(expires_at: 4.minutes.ago)
    Orders::ReleaseExpired.call
    expect(order.reload.status).to eq("pending_payment")
    order.update!(expires_at: 6.minutes.ago)
    2.times { Orders::ReleaseExpired.call }
    expect(order.reload.status).to eq("expired")
    expect(product.reload.stock_quantity).to eq(3)
  end

  it "bounds each lazy cleanup batch" do
    product.update!(stock_quantity: 110)
    orders = 101.times.map do
      Orders::Checkout.call(email: "batch@example.com", idempotency_key: SecureRandom.uuid,
        items: [ { product_slug: product.slug, quantity: 1 } ]).order
    end
    Order.where(id: orders.map(&:id)).update_all(expires_at: 6.minutes.ago)
    Orders::ReleaseExpired.call
    expect(Order.where(id: orders.map(&:id), status: "expired").count).to eq(100)
    expect(product.reload.stock_quantity).to eq(109)
  end

  it "completes payment exactly once by status, even across different event IDs" do
    2.times do |n|
      Payments::ProcessEvent.call(provider: "simulated", event_id: "event-#{n}", event_type: "checkout.session.completed", order: order, payment_intent_id: "pi_once", shipping: { "name" => "Buyer" })
    end
    expect(order.reload.status).to eq("paid")
    expect(order.shipping).to eq("name" => "Buyer")
    expect(order.provider_payment_intent_id).to eq("pi_once")
    expect(product.reload.stock_quantity).to eq(1)
    expect(InventoryMovement.count).to eq(1)
  end

  it "ignores duplicate event IDs" do
    2.times { Payments::ProcessEvent.call(provider: "simulated", event_id: "same", event_type: "checkout.session.completed", order: order) }
    expect(PaymentEvent.count).to eq(1)
    expect(product.reload.stock_quantity).to eq(1)
  end

  it "re-reserves a released order on late payment" do
    Orders::Release.call(order, status: "expired")
    Payments::Complete.call(order)
    expect(order.reload.status).to eq("paid")
    expect(product.reload.stock_quantity).to eq(1)
    expect(InventoryMovement.where(reason: "late_payment_reserve").count).to eq(1)
  end

  it "marks late payment needs_attention without taking partial stock when it cannot re-reserve" do
    Orders::Release.call(order, status: "expired")
    product.update!(stock_quantity: 1)
    expect(Rails.logger).to receive(:error).with(/PAYMENT_NEEDS_ATTENTION/)
    Payments::Complete.call(order, payment_intent_id: "pi_late")
    expect(order.reload.status).to eq("needs_attention")
    expect(order.provider_payment_intent_id).to eq("pi_late")
    expect(order.paid_at).to be_present
    expect(product.reload.stock_quantity).to eq(1)
    Payments::Complete.call(order)
    expect(product.reload.stock_quantity).to eq(1)
  end

  it "marks sold_out_at only when no pending holds remain" do
    product.update!(stock_quantity: 2, kind: "drop", drop: create(:drop))
    order
    expect(product.reload.stock_quantity).to eq(0)
    expect(product.drop.reload.sold_out_at).to be_nil
    Payments::Complete.call(order)
    expect(product.drop.reload.sold_out_at).to be_present
    expect(product.drop.state).to eq("sold_out")
  end

  it "rolls back the event together with failed stock transitions" do
    order
    allow(Orders::Inventory).to receive(:refresh_drops!).and_raise("forced failure")
    expect { Payments::ProcessEvent.call(provider: "simulated", event_id: "rollback", event_type: "checkout.session.completed", order: order) }.to raise_error("forced failure")
    expect(PaymentEvent.count).to eq(0)
    expect(order.reload.status).to eq("pending_payment")
  end
  it "does not partially re-reserve a multi-product late payment" do
    other = create(:product, stock_quantity: 1)
    multi = Orders::Checkout.call(email: "multi@example.com", idempotency_key: "multi-late",
      items: [ { product_slug: product.slug, quantity: 1 }, { product_slug: other.slug, quantity: 1 } ]).order
    Orders::Release.call(multi, status: "expired")
    other.update!(stock_quantity: 0)
    Payments::Complete.call(multi)
    expect(multi.reload.status).to eq("needs_attention")
    expect(product.reload.stock_quantity).to eq(3)
    expect(other.reload.stock_quantity).to eq(0)
  end
end
