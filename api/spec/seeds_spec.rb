require "rails_helper"

RSpec.describe "Seed catalog" do
  it "preserves stock on rerun and references only supplied artwork derivatives" do
    load Rails.root.join("db/seeds.rb")
    core = Product.find_by!(slug: "hafa-adai-from-tumon-bay")
    limited = Product.find_by!(slug: "guahan-sunset-map")
    expect(core.stock_quantity).to eq(50)
    expect(limited.stock_quantity).to eq(500)
    expect(limited.drop.release_at).to be_nil
    expect(limited.drop.per_customer_limit).to eq(2)
    expect(core.price_cents).to eq(3500)
    expect(limited.price_cents).to eq(4500)
    core.update!(stock_quantity: 47)
    load Rails.root.join("db/seeds.rb")
    expect(core.reload.stock_quantity).to eq(47)
    expect(Product.count).to eq(2)
    expect(Drop.count).to eq(1)
    Product.all.each do |product|
      product.images.each do |image|
        expect(image["alt"]).to be_present
        image.fetch("widths").each do |width|
          path = Rails.root.join("../web/public#{image['base']}-#{width}.webp")
          expect(File.exist?(path)).to be(true), "Missing image: #{path}"
        end
      end
    end
  end
end
