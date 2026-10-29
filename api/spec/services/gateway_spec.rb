require "rails_helper"

RSpec.describe Payments::Gateway do
  it "creates a Stripe session with snapshots, shipping territories and order-scoped idempotency" do
    product = create(:product)
    order = Orders::Checkout.call(email: "a@example.com", idempotency_key: "stripe-options", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    order.update!(provider: "stripe", provider_session_expires_at: (31.minutes.from_now).change(usec: 0))
    expect(Stripe::Checkout::Session).to receive(:create) do |options, request_options|
      expect(options[:metadata]).to eq(order_token: order.token)
      expect(options[:customer_email]).to eq("a@example.com")
      expect(options[:expires_at]).to be >= (30.minutes + 1.minute).from_now.to_i - 1
      expect(options[:success_url]).to eq("http://localhost:5181/orders/#{order.token}?from=checkout")
      expect(options[:cancel_url]).to eq("http://localhost:5181/checkout/cancel/#{order.token}")
      expect(options[:shipping_address_collection][:allowed_countries]).to eq(%w[US GU PR])
      expect(options[:line_items].first[:price_data][:unit_amount]).to eq(3500)
      expect(request_options).to eq(idempotency_key: "tano-y-tasi-order-#{order.token}")
      Stripe::StripeObject.construct_from(id: "cs_test", url: "https://checkout.stripe.com/test")
    end
    session = described_class.create_session(order)
    expect(session[:id]).to eq("cs_test")
    expect(session[:expires_at]).to be >= order.expires_at
  end

  it "extends the order hold to the Stripe session window" do
    product = create(:product)
    allow(Payments::Gateway).to receive(:provider).and_return("stripe")
    allow(Stripe::Checkout::Session).to receive(:create).and_return(
      Stripe::StripeObject.construct_from(id: "cs_window", url: "https://checkout.stripe.com/window")
    )
    order = travel_to(Time.current) do
      Orders::Checkout.call(email: "w@example.com", idempotency_key: "stripe-window", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    end
    expect(order.expires_at).to be >= (30.minutes + 1.minute).from_now - 2.seconds
  end

  it "expires the open Stripe session when the customer cancels" do
    product = create(:product)
    order = Orders::Checkout.call(email: "c@example.com", idempotency_key: "stripe-cancel", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    order.update!(provider: "stripe", provider_session_id: "cs_cancel")
    expect(Stripe::Checkout::Session).to receive(:expire).with("cs_cancel").and_return(Stripe::StripeObject.construct_from(status: "expired"))
    Orders::Release.call(order)
    described_class.expire_session(order)
  end

  it "does not raise when expiring the Stripe session fails" do
    order = Order.new(id: 1, provider: "stripe", provider_session_id: "cs_gone")
    allow(Stripe::Checkout::Session).to receive(:expire).and_raise(Stripe::APIConnectionError.new("offline"))
    expect { described_class.expire_session(order) }.not_to raise_error
  end
end
