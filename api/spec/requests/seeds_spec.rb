require "rails_helper"

RSpec.describe "Catalog seeds" do
  def seed_catalog
    # Match the mandatory guard used before production's separate seed step.
    raise "Unsafe seed database" unless ActiveRecord::Base.connection.current_database == "tano_y_tasi_test"
    load Rails.root.join("db/seeds.rb")
  end

  it "creates the complete catalog on a fresh database" do
    expect { seed_catalog }.to change(Product, :count).by(2).and change(Drop, :count).by(1)
    core = Product.find_by!(slug: "hafa-adai-from-tumon-bay")
    map = Product.find_by!(slug: "guahan-sunset-map")
    expect(core).to have_attributes(price_cents: 3500, stock_quantity: 50, status: "active")
    expect(core.specs).to include("piece_count" => 100, "finished_size" => "12 × 9 in")
    expect(core.gallery_images.map { |image| image.fetch("base").split("/").last }).to eq(%w[finished-flat piece-detail finished-tabletop])
    expect(core.box.keys).to eq(%i[front back left right])
    expect(core.images.first).to include("role" => "hero", "aspect" => "12:7")
    expect(map).to have_attributes(price_cents: 4500, stock_quantity: 500, kind: "drop")
    expect(map.gallery_images.size).to eq(4)
    expect(map.box[:front]).to include("base" => "/images/products/guahan-sunset-map/box-placeholder-front", "aspect" => "4:5")
    expect(map.drop).to have_attributes(quantity: 500, per_customer_limit: 2, release_at: nil)
  end

  it "preserves every existing product and drop attribute after merchant edits and a second seed" do
    seed_catalog
    Product.find_each do |product|
      product.update!(name: "Merchant's #{product.slug}", price_cents: 6100, stock_quantity: 7,
        status: "draft", summary: "Edited summary", description: "Edited description", position: 12,
        specs: { piece_count: 800, finished_size: "24 × 30 in", material: "Edited" },
        images: [ { role: "hero", base: "/images/edited", widths: [ 640 ], aspect: "1:1", alt: "Edited" } ],
        includes: [ "Edited contents" ], art: { credit: "Merchant", story: "Edited" }, placeholders: [])
    end
    Drop.first.update!(name: "Edited drop", number: 8, quantity: 42, per_customer_limit: 1,
      release_at: 10.days.from_now, closes_at: 11.days.from_now, sold_out_at: 1.day.ago)
    products = Product.order(:id).map(&:attributes)
    drops = Drop.order(:id).map(&:attributes)
    seed_catalog
    expect(Product.order(:id).map(&:attributes)).to eq(products)
    expect(Drop.order(:id).map(&:attributes)).to eq(drops)
  end
end
