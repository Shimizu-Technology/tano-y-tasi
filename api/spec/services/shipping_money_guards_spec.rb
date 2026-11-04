require "rails_helper"

RSpec.describe "Shipping money guards" do
  it "declares a giveaway at a positive customs value" do
    product = create(:product, price_cents: 0)
    settings = Shipping::Settings.current
    line = Shipping::Parcel::Line.new(product: product, quantity: 1, unit_price_cents: 0)
    expect(Shipping::Parcel.customs_items([ line ], settings).first[:value]).to eq(1.0)
  end

  it "won't buy a label while a refund holds the order's money lease" do
    order = create_paid_order
    ProviderLease.create!(key: "money-#{order.id}", holder: "refund", expires_at: 1.minute.from_now)
    stub_const("ProviderLease::WAIT", 0.seconds)
    allow(Shipping::EasyPostClient).to receive(:configured?).and_return(true)
    expect { Shipping::Label.buy(order) }.to raise_error(ProviderLease::Busy)
    expect { Payments::IssueRefund.call(order) }.to raise_error(ProviderLease::Busy)
  end

  it "won't buy a label while a refund is unconfirmed" do
    order = create_paid_order
    order.update!(shipping: { name: "A", address: { line1: "1 Marine Dr", city: "Hagatna", state: "GU", postal_code: "96910", country: "US" } }, fulfillment_method: "ship")
    order.refund_requests.create!(amount_cents: 3500)
    allow(Shipping::EasyPostClient).to receive(:configured?).and_return(true)
    allow_any_instance_of(Shipping::Settings).to receive(:origin_complete?).and_return(true)
    expect { Shipping::Label.buy(order) }.to raise_error(ApiError) { |error| expect(error.message).to match(/hasn't been confirmed/) }
  end

  def create_paid_order
    product = create(:product)
    order = Order.create!(email: "a@example.com", idempotency_key: SecureRandom.uuid, request_fingerprint: "f", subtotal_cents: 3500, total_cents: 3500,
      expires_at: 1.hour.from_now, provider: "stripe", status: "paid", paid_at: Time.current)
    order.order_items.create!(product: product, product_slug: product.slug, name: product.name, quantity: 1, unit_price_cents: 3500)
    order
  end
end
