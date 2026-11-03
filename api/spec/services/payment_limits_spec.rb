require "rails_helper"

RSpec.describe "Drop limits across delayed payments" do
  let(:product) { create(:product, stock_quantity: 10, kind: "drop", drop: create(:drop, per_customer_limit: 2)) }

  def checkout
    Orders::Checkout.call(email: "Buyer@Example.com", idempotency_key: SecureRandom.uuid,
      items: [ { product_slug: product.slug, quantity: 2 } ]).order
  end

  it "flags a payment for a drop moved back to Coming soon and releases its hold once" do
    order = checkout
    product.drop.update!(release_at: nil)
    Payments::Complete.call(order, payment_intent_id: "pi_withdrawn")
    expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "drop_withdrawn")
    expect(product.reload.stock_quantity).to eq(10)
    Payments::Complete.call(order, payment_intent_id: "pi_withdrawn")
    expect(InventoryMovement.where(order: order, reason: "release").count).to eq(1)
  end

  it "does not re-reserve a late payment for a drop moved back to Coming soon" do
    order = checkout
    Orders::Release.call(order, status: "expired")
    product.drop.update!(release_at: nil)
    Payments::Complete.call(order, payment_intent_id: "pi_late")
    expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "drop_withdrawn")
    expect(product.reload.stock_quantity).to eq(10)
  end

  it "flags a payment that arrives after the store closed and takes no stock" do
    expired = checkout
    Orders::Release.call(expired, status: "expired")
    pending = checkout
    allow(StoreSetting).to receive(:sales_open?).and_return(false)
    [ pending, expired ].each do |order|
      Payments::Complete.call(order, payment_intent_id: "pi_#{order.id}")
      expect(order.reload).to have_attributes(status: "needs_attention", attention_reason: "store_closed")
    end
    expect(product.reload.stock_quantity).to eq(10)
  end

  it "treats Gmail dots and +tags as the same customer" do
    first = checkout
    Payments::Complete.call(first)
    gmail = lambda do |email|
      Orders::Checkout.call(email: email, idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 } ])
    end
    gmail.call("buyer.one@gmail.com")
    [ "buyerone+drop@gmail.com", "b.uyerone@googlemail.com" ].each do |variant|
      expect { gmail.call(variant) }.to raise_error(ApiError) { |error| expect(error.code).to eq("limit_exceeded") }
    end
  end

  it "counts an expired-but-payable hold throughout the five-minute grace period" do
    first = checkout
    first.update!(expires_at: 2.minutes.ago)
    expect { checkout }.to raise_error(ApiError) do |error|
      expect(error.code).to eq("limit_exceeded")
      expect(error.details[:already_purchased]).to eq(2)
    end
    Payments::Complete.call(first)
    expect(first.reload.status).to eq("paid")
    expect(product.reload.stock_quantity).to eq(8)
  end

  [ :old_first, :new_first ].each do |completion_order|
    it "prevents 2 becoming 4 after expiry and replacement, completing #{completion_order}" do
      first = checkout
      first.update!(expires_at: 6.minutes.ago)
      second = checkout
      expect(first.reload.status).to eq("expired")
      expect(Rails.logger).to receive(:error).with(/reason=customer_limit_exceeded .*refund_required=true/)
        .exactly(completion_order == :old_first ? 2 : 1).times
      sequence = completion_order == :old_first ? [ first, second ] : [ second, first ]
      sequence.each { |order| Payments::Complete.call(order, payment_intent_id: "pi_#{order.id}") }
      expect(first.reload.status).to eq("needs_attention")
      expect(first.paid_at).to be_present
      expect(first.provider_payment_intent_id).to eq("pi_#{first.id}")
      expect(second.reload.status).to eq(completion_order == :old_first ? "needs_attention" : "paid")
      expected_stock = completion_order == :old_first ? 10 : 8
      expect(product.reload.stock_quantity).to eq(expected_stock)
      expect(InventoryMovement.where(order: first, reason: "late_payment_reserve")).not_to exist
      expect(InventoryMovement.where(order: first, reason: "release").count).to eq(1)
      2.times { Payments::Complete.call(first) }
      expect(product.reload.stock_quantity).to eq(expected_stock)
      expect { checkout }.to raise_error(ApiError) { |error| expect(error.code).to eq("limit_exceeded") }
    end
  end

  it "rechecks pending completion and releases every reserved item exactly once on violation" do
    core = create(:product, stock_quantity: 5)
    pending = Orders::Checkout.call(email: "buyer@example.com", idempotency_key: SecureRandom.uuid,
      items: [ { product_slug: product.slug, quantity: 2 }, { product_slug: core.slug, quantity: 1 } ]).order
    # Reproduce already-paid legacy data that violated the old completion check.
    prior = Orders::Checkout.call(email: "legacy@example.com", idempotency_key: SecureRandom.uuid,
      items: [ { product_slug: product.slug, quantity: 2 } ]).order
    Payments::Complete.call(prior)
    prior.update!(email: "buyer@example.com")
    expect(Rails.logger).to receive(:error).with(/reason=customer_limit_exceeded/)
    2.times { Payments::Complete.call(pending, payment_intent_id: "pi_pending_limit") }
    expect(pending.reload.status).to eq("needs_attention")
    expect(pending.provider_payment_intent_id).to eq("pi_pending_limit")
    expect(pending.paid_at).to be_present
    expect(product.reload.stock_quantity).to eq(8)
    expect(core.reload.stock_quantity).to eq(5)
    expect(InventoryMovement.where(order: pending, reason: "release").count).to eq(2)
  end

  it "counts paid needs_attention orders but excludes unpaid ones" do
    first = checkout
    Orders::Release.call(first)
    first.update!(status: "needs_attention", paid_at: nil)
    second = checkout
    Orders::Release.call(second)
    first.update!(paid_at: Time.current)
    expect { checkout }.to raise_error(ApiError) { |error| expect(error.details[:already_purchased]).to eq(2) }
  end

  it "rechecks the limit on canceled orders before late re-reservation" do
    first = checkout
    Orders::Release.call(first)
    second = checkout
    Payments::Complete.call(second)
    Payments::Complete.call(first)
    expect(first.reload.status).to eq("needs_attention")
    expect(product.reload.stock_quantity).to eq(8)
    expect(InventoryMovement.where(order: first, reason: "release").count).to eq(1)
    expect(InventoryMovement.where(order: first, reason: "late_payment_reserve")).not_to exist
  end

  it "rejects legacy overlapping holds when an expired-but-payable pending order completes" do
    first = checkout
    first.update!(expires_at: 2.minutes.ago)
    # Old checkout code excluded this still-payable hold and allowed two more.
    second = Orders::Checkout.call(email: "legacy@example.com", idempotency_key: SecureRandom.uuid,
      items: [ { product_slug: product.slug, quantity: 2 } ]).order
    second.update!(email: "buyer@example.com")
    [ first, second ].each { |order| Payments::Complete.call(order) }
    expect([ first.reload.status, second.reload.status ]).to eq(%w[needs_attention needs_attention])
    expect(product.reload.stock_quantity).to eq(10)
    expect(InventoryMovement.where(order: [ first, second ], reason: "release").count).to eq(2)
    expect(Order.where(status: "paid")).not_to exist
  end
end
