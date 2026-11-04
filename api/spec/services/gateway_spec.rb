require "rails_helper"

RSpec.describe Payments::Gateway do
  it "names the ship date on a preorder's Stripe line, from the order's snapshot, and leaves other lines alone" do
    preorder = create(:product, preorder: true, preorder_ships: "Ships late January 2027")
    in_stock = create(:product)
    order = checkout_call(email: "a@example.com", idempotency_key: "stripe-preorder", items: [ { product_slug: preorder.slug, quantity: 1 }, { product_slug: in_stock.slug, quantity: 1 } ]).order
    preorder.update!(preorder_ships: "Ships in March 2027")
    order.update!(provider: "stripe", provider_session_expires_at: 31.minutes.from_now.change(usec: 0))
    expect(Stripe::Checkout::Session).to receive(:create) do |options, _request_options|
      lines = options[:line_items].map { |line| line.dig(:price_data, :product_data) }
      expect(lines).to contain_exactly({ name: preorder.name, description: "Preorder. Ships late January 2027" }, { name: in_stock.name })
      Stripe::StripeObject.construct_from(id: "cs_preorder", url: "https://checkout.stripe.com/c/pay/cs_preorder")
    end
    described_class.create_session(order)
  end

  it "creates a Stripe session with snapshots, the saved address and order-scoped idempotency" do
    product = create(:product)
    order = checkout_call(email: "a@example.com", idempotency_key: "stripe-options", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    order.update!(provider: "stripe", provider_session_expires_at: (31.minutes.from_now).change(usec: 0))
    expect(Stripe::Checkout::Session).to receive(:create) do |options, request_options|
      expect(options[:metadata]).to eq(order_token: order.token)
      expect(options[:customer_email]).to eq("a@example.com")
      expect(options[:expires_at]).to be >= (30.minutes + 1.minute).from_now.to_i - 1
      expect(options[:success_url]).to eq("http://localhost:5181/orders/#{order.token}?from=checkout")
      expect(options[:cancel_url]).to eq("http://localhost:5181/checkout/cancel/#{order.token}")
      expect(options).not_to include(:shipping_address_collection, :automatic_tax, :billing_address_collection)
      expect(options[:payment_intent_data][:shipping]).to eq(name: "A Buyer", phone: "671-555-0100",
        address: { "line1" => "123 Marine Corps Drive", "city" => "Hagåtña", "state" => "GU", "postal_code" => "96910", "country" => "US" })
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
      checkout_call(email: "w@example.com", idempotency_key: "stripe-window", items: [ { product_slug: product.slug, quantity: 1 } ]).order
    end
    expect(order.expires_at).to be >= (30.minutes + 1.minute).from_now - 2.seconds
  end

  it "expires the open Stripe session when the customer cancels" do
    product = create(:product)
    order = checkout_call(email: "c@example.com", idempotency_key: "stripe-cancel", items: [ { product_slug: product.slug, quantity: 1 } ]).order
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

RSpec.describe Payments::Gateway, "shipping and tax" do
  let(:product) { create(:product) }
  let(:items) { [ { product_slug: product.slug, quantity: 1 } ] }

  def session_for(shipping)
    order = checkout_call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: items, shipping: shipping).order
    order.update!(provider: "stripe", provider_session_expires_at: 31.minutes.from_now.change(usec: 0))
    captured = nil
    allow(Stripe::Checkout::Session).to receive(:create) do |options, _request|
      captured = options
      Stripe::StripeObject.construct_from(id: "cs_1", url: "https://checkout.stripe.com/1")
    end
    described_class.create_session(order)
    captured
  end

  it "adds shipping as its own named line, and puts the address on the payment" do
    options = session_for(shipping_for(items, amount_cents: 820, kind: "live", label: "USPS Ground Advantage"))
    expect(options[:line_items].last).to eq(quantity: 1, price_data: { currency: "usd", unit_amount: 820, product_data: { name: "Shipping: USPS Ground Advantage" } })
    expect(options).not_to include(:shipping_address_collection, :automatic_tax)
    expect(options.dig(:payment_intent_data, :shipping, :name)).to eq("A Buyer")
    expect(options.dig(:payment_intent_data, :shipping, :address)).to include("state" => "GU", "country" => "US", "postal_code" => "96910")
  end

  it "leaves out a free shipping line, which Stripe would reject" do
    options = session_for(shipping_for(items, amount_cents: 0, kind: "live", label: "USPS Ground Advantage"))
    expect(options[:line_items].size).to eq(1)
    expect(options[:line_items].first.dig(:price_data, :product_data, :name)).to eq(product.name)
  end

  it "leaves out a free item beside a paid one" do
    free = create(:product, price_cents: 0, name: "Free sticker")
    cart = items + [ { product_slug: free.slug, quantity: 1 } ]
    order = checkout_call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: cart).order
    order.update!(provider: "stripe", provider_session_expires_at: 31.minutes.from_now.change(usec: 0))
    allow(Stripe::Checkout::Session).to receive(:create) do |options, _request|
      expect(options[:line_items].map { |line| line.dig(:price_data, :product_data, :name) }).to eq([ product.name ])
      Stripe::StripeObject.construct_from(id: "cs_1", url: "https://checkout.stripe.com/1")
    end
    described_class.create_session(order)
  end

  it "sends no shipping address to Stripe for pickup" do
    options = session_for(shipping_for(items, amount_cents: 0, kind: "pickup", label: "Pick up in Guam"))
    expect(options).not_to include(:payment_intent_data)
    expect(options[:line_items].size).to eq(1)
  end

  context "with tax on" do
    before { StoreSetting.current.update!(tax_enabled: true) }

    it "turns on Stripe Tax, codes the shipping line, requires a billing address, and adds tax on top" do
      options = session_for(shipping_for(items, amount_cents: 820, kind: "live", label: "USPS Ground Advantage"))
      expect(options[:automatic_tax]).to eq(enabled: true)
      expect(options[:billing_address_collection]).to eq("required")
      expect(options[:line_items].last.dig(:price_data, :product_data, :tax_code)).to eq("txcd_92010001")
      expect(options[:line_items].map { |line| line.dig(:price_data, :tax_behavior) }).to all(eq("exclusive"))
    end
  end
end
