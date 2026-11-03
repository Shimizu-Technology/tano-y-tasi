require "rails_helper"
require Rails.root.join("db/migrate/20261104000001_allow_unannounced_drops")

RSpec.describe AllowUnannouncedDrops do
  let(:drop) { create(:drop, slug: "drop-001-guahan-sunset-map", release_at: Time.iso8601("2026-12-05T00:00:00Z")) }
  let!(:product) do
    create(:product, :limited, drop: drop, slug: "guahan-sunset-map",
      placeholders: [ "drop.release_at" ], description: "Find your way around Guåhan. Drop 001 is a single release of 100 puzzles.")
  end

  it "moves the untouched seed drop to coming soon and removes the placeholder quantity copy" do
    described_class.new.up
    expect(drop.reload.release_at).to be_nil
    expect(drop.state).to eq("upcoming")
    expect(product.reload.description).to eq("Find your way around Guåhan. Drop 001 is a one-time release.")
  end

  it "keeps a merchant-chosen release date and description" do
    release = Time.iso8601("2027-02-01T00:00:00Z")
    drop.update!(release_at: release)
    product.update!(description: "Merchant copy.")
    described_class.new.up
    expect(drop.reload.release_at).to eq(release)
    expect(product.reload.description).to eq("Merchant copy.")
  end

  it "keeps the seed date once the merchant has confirmed it" do
    product.update!(placeholders: [])
    described_class.new.up
    expect(drop.reload.release_at).to eq(Time.iso8601("2026-12-05T00:00:00Z"))
  end

  it "refuses to roll back while a drop has no date" do
    described_class.new.up
    expect { described_class.new.down }.to raise_error(ActiveRecord::IrreversibleMigration)
    expect(drop.reload.release_at).to be_nil
  end

  it "keeps the date once anyone has ordered from the drop" do
    order = Order.create!(email: "a@b.com", idempotency_key: "k", request_fingerprint: "f", subtotal_cents: 1, total_cents: 1, expires_at: 1.hour.from_now, provider: "simulated")
    order.order_items.create!(product: product, product_slug: product.slug, name: product.name, quantity: 1, unit_price_cents: 1)
    described_class.new.up
    expect(drop.reload.release_at).to eq(Time.iso8601("2026-12-05T00:00:00Z"))
  end
end
