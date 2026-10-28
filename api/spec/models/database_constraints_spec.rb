require "rails_helper"

RSpec.describe "Database invariants" do
  it "rejects negative stock at the database layer" do
    product = create(:product)
    expect do
      Product.transaction(requires_new: true) { product.update_columns(stock_quantity: -1) }
    end.to raise_error(ActiveRecord::StatementInvalid, /stock_nonnegative/)
  end

  it "enforces unique provider payment intent IDs across orders" do
    product = create(:product)
    orders = 2.times.map do |n|
      Orders::Checkout.call(email: "buyer@example.com", idempotency_key: "unique-#{n}", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    end
    Payments::Complete.call(orders.first, payment_intent_id: "pi_unique")
    expect do
      Order.transaction(requires_new: true) { Payments::Complete.call(orders.last, payment_intent_id: "pi_unique") }
    end.to raise_error(ActiveRecord::RecordNotUnique)
    expect(orders.last.reload.status).to eq("pending_payment")
  end

  it "enforces case-insensitive subscriber uniqueness without model validation" do
    Subscriber.create!(email: "a@example.com")
    expect do
      Subscriber.transaction(requires_new: true) { Subscriber.insert_all!([ { email: "A@EXAMPLE.COM" } ]) }
    end.to raise_error(ActiveRecord::RecordNotUnique)
  end
end
