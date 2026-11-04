require "rails_helper"

RSpec.describe "Shipping in order emails" do
  let(:product) { create(:product) }
  let(:items) { [ { product_slug: product.slug, quantity: 1 } ] }

  around do |example|
    saved = ENV["MAILER_FROM_EMAIL"]
    ENV["MAILER_FROM_EMAIL"] = "Tåno + Tåsi <orders@example.com>"
    example.run
  ensure
    saved.nil? ? ENV.delete("MAILER_FROM_EMAIL") : ENV["MAILER_FROM_EMAIL"] = saved
  end

  def order_with(**shipping)
    checkout_call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: items, shipping: shipping_for(items, **shipping)).order
  end

  def payload(order, kind)
    Emails::Template.payload(EmailDelivery.new(order: order, kind: kind, to: "a@example.com", subject: Emails::Template.subject(kind, order)))
  end

  it "itemizes shipping and tax, and totals what the customer paid" do
    order = order_with(amount_cents: 820, kind: "live", label: "USPS Ground Advantage")
    order.update!(tax_cents: 344)
    %w[order_confirmation admin_new_order admin_attention order_shipped order_refunded].each do |kind|
      data = payload(order, kind)
      [ data[:text], data[:html] ].each do |body|
        expect(body).to include("Subtotal: $35.00 USD", "Shipping (USPS Ground Advantage): $8.20 USD", "Tax: $3.44 USD", "Total: $46.64 USD")
      end
    end
  end

  it "leaves the tax line off when there is none, and says where it's going" do
    data = payload(order_with(amount_cents: 1200, label: "Standard"), "order_confirmation")
    expect(data[:text]).not_to include("Tax:")
    expect(data[:text]).to include("Shipping to:", "A Buyer", "123 Marine Corps Drive", "Hagåtña, GU 96910")
  end

  it "escapes an address in the HTML" do
    address = ShippingHelpers::GUAM_ADDRESS.merge(name: "<b>Mina</b>")
    data = payload(order_with(amount_cents: 0, label: "Standard", address: address), "order_confirmation")
    expect(data[:html]).to include("&lt;b&gt;Mina&lt;/b&gt;")
    expect(data[:html]).not_to include("<b>Mina</b>")
  end

  it "keeps an order from before shipping to one total, using Stripe's address" do
    order = order_with(amount_cents: 0)
    order.update!(shipping_method: nil, shipping: { "name" => "Old Buyer", "address" => { "city" => "Hagåtña", "state" => "GU", "postal_code" => "96910" } })
    data = payload(order, "order_confirmation")
    expect(data[:text]).not_to include("Subtotal:", "Shipping (")
    expect(data[:text]).to include("Total: $35.00 USD", "Old Buyer")
  end

  it "tells a pickup customer where to go, not that it shipped" do
    order = order_with(amount_cents: 0, kind: "pickup", label: "Pick up in Guam", instructions: "Tumon, weekdays.")
    expect(Emails::Template.subject("order_shipped", order)).to include("ready for pickup")
    data = payload(order, "order_shipped")
    expect(data[:text]).to include("Pick up in Guam: Tumon, weekdays.")
    expect(data[:text]).not_to include("Shipping to:")
  end
end
