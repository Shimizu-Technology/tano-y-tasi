require "rails_helper"

RSpec.describe Payments::Gateway do
  it "creates a Stripe session with snapshots, shipping territories and order-scoped idempotency" do
    product = create(:product)
    order = Orders::Checkout.call(email: "a@example.com", idempotency_key: "stripe-options", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    order.update!(provider: "stripe")
    expect(Stripe::Checkout::Session).to receive(:create) do |options, request_options|
      expect(options[:metadata]).to eq(order_token: order.token)
      expect(options[:customer_email]).to eq("a@example.com")
      expect(options[:expires_at]).to eq(order.expires_at.to_i)
      expect(options[:success_url]).to eq("http://localhost:5181/orders/#{order.token}?from=checkout")
      expect(options[:cancel_url]).to eq("http://localhost:5181/checkout/cancel/#{order.token}")
      expect(options[:shipping_address_collection][:allowed_countries]).to eq(%w[US GU PR VI AS MP])
      expect(options[:line_items].first[:price_data][:unit_amount]).to eq(3500)
      expect(request_options).to eq(idempotency_key: "tano-y-tasi-order-#{order.token}")
      Stripe::StripeObject.construct_from(id: "cs_test", url: "https://checkout.stripe.com/test")
    end
    expect(described_class.create_session(order)[:id]).to eq("cs_test")
  end
end
