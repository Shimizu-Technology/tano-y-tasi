require "rails_helper"

RSpec.describe Drop do
  let(:drop) { create(:drop, per_customer_limit: 2) }
  let!(:first) { create(:product, :limited, drop: drop, position: 1, stock_quantity: 3) }
  let!(:second) { create(:product, :limited, drop: drop, position: 2, stock_quantity: 3) }

  it "leads with the first product by position" do
    expect(drop.reload.product).to eq(first)
    first.update!(position: 3)
    expect(drop.reload.product).to eq(second)
  end

  it "is live until every product is out of stock" do
    expect(drop.reload.state).to eq("live")
    first.update!(stock_quantity: 0)
    expect(drop.reload.state).to eq("live")
    second.update!(stock_quantity: 0)
    expect(drop.reload.state).to eq("sold_out")
  end

  it "doesn't let a product that isn't on sale keep the drop open" do
    second.update!(stock_quantity: 0)
    first.update!(status: "archived")
    expect(drop.reload.state).to eq("sold_out")
    first.update!(status: "draft")
    expect(drop.reload.state).to eq("sold_out")
    first.update!(status: "active", images: [])
    expect(drop.reload.state).to eq("sold_out")
  end

  it "judges a drop with nothing on sale by all its products, as it always has" do
    [ first, second ].each { |product| product.update!(status: "archived") }
    expect(drop.reload.state).to eq("live")
    [ first, second ].each { |product| product.update!(stock_quantity: 0) }
    expect(drop.reload.state).to eq("sold_out")
  end

  it "hides the quantity when any product marks it as a placeholder" do
    expect(drop.reload.public_quantity).to eq(100)
    second.update!(placeholders: [ "drop.quantity" ])
    expect(drop.reload.public_quantity).to be_nil
  end

  it "records the sell-out only when no product has stock or an open hold" do
    first.update!(stock_quantity: 1)
    second.update!(stock_quantity: 1)
    order = Orders::Checkout.call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: first.slug, quantity: 1 } ]).order
    Payments::Complete.call(order)
    expect(drop.reload.sold_out_at).to be_nil
    held = Orders::Checkout.call(email: "b@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: second.slug, quantity: 1 } ]).order
    Orders::Inventory.refresh_drop!(first)
    expect(drop.reload.state).to eq("sold_out")
    expect(drop.sold_out_at).to be_nil
    Payments::Complete.call(held)
    expect(drop.reload.sold_out_at).to be_present
    Orders::Inventory.adjust!(second.reload, 1, "Found one")
    expect(drop.reload.sold_out_at).to be_nil
    expect(drop.state).to eq("live")
  end

  it "applies withdrawn and closed checks per product through its own drop" do
    core = create(:product, stock_quantity: 5)
    other_drop = create(:drop, release_at: 1.day.from_now)
    upcoming = create(:product, :limited, drop: other_drop, stock_quantity: 5)
    expect {
      Orders::Checkout.call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: core.slug, quantity: 1 }, { product_slug: upcoming.slug, quantity: 1 } ])
    }.to raise_error(ApiError) { |error| expect(error.details[:product_slug]).to eq(upcoming.slug) }
    expect(core.reload.stock_quantity).to eq(5)
  end
end
