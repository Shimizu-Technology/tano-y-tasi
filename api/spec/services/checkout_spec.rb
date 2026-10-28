require "rails_helper"

RSpec.describe Orders::Checkout do
  let(:product) { create(:product, stock_quantity: 5) }
  let(:payload) { { email: "Buyer@Example.com ", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 } ] } }
  def checkout(attributes = {})
    described_class.call(payload.merge(attributes)).order
  end

  it "reserves exactly once, normalizes email, and snapshots prices and images" do
    order = checkout
    expect(product.reload.stock_quantity).to eq(3)
    expect(order.email).to eq("buyer@example.com")
    expect(order.number).to match(/\ATYT-\d{6,}\z/)
    expect(order.token.length).to eq(40)
    expect(order.total_cents).to eq(7000)
    expect(order.expires_at).to be_within(2.seconds).of(30.minutes.from_now)
    expect(order.order_items.first.image).to eq(product.images.first)
    product.update!(price_cents: 9900, name: "Changed")
    expect(order.order_items.first.unit_price_cents).to eq(3500)
    expect(order.order_items.first.name).to eq("Håfa Adai from Tumon Bay")
    expect(InventoryMovement.where(order: order).pluck(:delta, :balance, :reason)).to eq([ [ -2, 3, "reserve" ] ])
  end

  it "returns the canonical order and payment URL on retry" do
    first = described_class.call(payload)
    second = described_class.call(payload)
    expect(first.created).to be(true)
    expect(second.created).to be(false)
    expect(second.order.id).to eq(first.order.id)
    expect(second.order.payment_url).to eq(first.order.payment_url)
    expect(product.reload.stock_quantity).to eq(3)
    expect(Order.count).to eq(1)
  end

  it "rejects a changed payload with the same key" do
    checkout
    expect { checkout(email: "other@example.com") }.to raise_error(ApiError) { |error| expect(error.code).to eq("idempotency_conflict") }
    expect(product.reload.stock_quantity).to eq(3)
  end

  it "canonicalizes email, item order, and repeated product lines" do
    first = checkout
    second = checkout(email: "buyer@example.com", items: [ { product_slug: product.slug, quantity: 1 }, { product_slug: product.slug, quantity: 1 } ])
    expect(second).to eq(first)
  end

  it "rolls back every item when one product is unavailable" do
    unavailable = create(:product, stock_quantity: 0)
    expect { checkout(items: payload[:items] + [ { product_slug: unavailable.slug, quantity: 1 } ]) }.to raise_error(ApiError)
    expect(product.reload.stock_quantity).to eq(5)
    expect(Order.count).to eq(0)
    expect(InventoryMovement.count).to eq(0)
  end

  it "releases inventory if provider creation fails" do
    allow(Payments::Gateway).to receive(:create_session).and_raise(Stripe::APIConnectionError, "offline")
    expect { checkout }.to raise_error(ApiError) { |error| expect(error.code).to eq("payment_unavailable") }
    expect(product.reload.stock_quantity).to eq(5)
    expect(Order.last.status).to eq("canceled")
  end

  it "calls the gateway after the reservation transaction commits" do
    allow(Payments::Gateway).to receive(:create_session) do |order|
      # The example itself has an outer fixture transaction; reservation is not nested here.
      expect(ActiveRecord::Base.connection.open_transactions).to eq(1)
      expect(order).to be_persisted
      { id: "sim_session", url: "http://localhost:5181/pay" }
    end
    checkout
  end

  it "counts paid and unexpired pending orders toward the case-insensitive customer limit" do
    product.update!(kind: "drop", drop: create(:drop, per_customer_limit: 2))
    first = checkout(items: [ { product_slug: product.slug, quantity: 1 } ])
    Payments::Complete.call(first)
    checkout(idempotency_key: SecureRandom.uuid, email: "BUYER@example.com", items: [ { product_slug: product.slug, quantity: 1 } ])
    expect { checkout(idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 1 } ]) }.to raise_error(ApiError) do |error|
      expect(error.code).to eq("limit_exceeded")
      expect(error.details).to eq(limit: 2, already_purchased: 2)
    end
  end

  it "excludes canceled and expired pending holds from the customer limit" do
    product.update!(kind: "drop", drop: create(:drop, per_customer_limit: 2))
    first = checkout
    Orders::Release.call(first)
    second = checkout(idempotency_key: SecureRandom.uuid)
    second.update!(expires_at: 36.minutes.ago)
    third = checkout(idempotency_key: SecureRandom.uuid)
    expect(third.status).to eq("pending_payment")
    expect(second.reload.status).to eq("expired")
    expect(product.reload.stock_quantity).to eq(3)
  end

  it "rejects an upcoming or closed drop" do
    product.update!(kind: "drop", drop: create(:drop, release_at: 1.day.from_now))
    expect { checkout }.to raise_error(ApiError) { |error| expect(error.code).to eq("drop_not_live") }
    product.drop.update!(release_at: 1.day.ago, closes_at: 1.hour.ago)
    expect { checkout }.to raise_error(ApiError) { |error| expect(error.code).to eq("drop_not_live") }
  end

  it "aggregates duplicate cart lines before checking the limit" do
    product.update!(kind: "drop", drop: create(:drop))
    expect { checkout(items: [ payload[:items].first, payload[:items].first ]) }.to raise_error(ApiError) { |error| expect(error.code).to eq("limit_exceeded") }
  end
end
