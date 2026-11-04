require "rails_helper"
require Rails.root.join("db/migrate/20261029000005_refresh_core_puzzle_images")

RSpec.describe RefreshCorePuzzleImages do
  let(:legacy) { JSON.parse(File.read(Rails.root.join("spec/fixtures/legacy_core_images.json"))) }
  let(:product) { create(:product, slug: "hafa-adai-from-tumon-bay", images: legacy) }

  it "replaces the exact pre-create-only seed list, preserving all other product attributes" do
    before = product.attributes.except("images")
    described_class.new.up
    expect(product.reload.images.map { |image| image.fetch("base").split("/").last }).to eq(%w[finished-flat piece-detail finished-tabletop])
    expect(product.images.first).to include("aspect" => "12:7", "role" => "hero")
    expect(product.attributes.except("images")).to eq(before)
    images = product.images
    described_class.new.up
    expect(product.reload.images).to eq(images)
  end

  it "preserves merchant changes to any part of the image list, including order" do
    edits = [
      legacy.reverse,
      legacy.take(4),
      legacy.map.with_index { |image, i| i.zero? ? image.merge("alt" => "Merchant description") : image },
      legacy.map.with_index { |image, i| i.zero? ? image.merge("widths" => [ 640 ]) : image },
      legacy.map.with_index { |image, i| i.zero? ? image.merge("role" => "lifestyle") : image },
      [ { "base" => "/images/merchant-photo", "aspect" => "1:1", "widths" => [ 640 ], "role" => "hero", "alt" => "Merchant photo" } ],
      []
    ]
    edits.each do |images|
      product.update!(images: images)
      described_class.new.up
      expect(product.reload.images).to eq(images)
    end
  end

  it "does not change other products even if their images match" do
    other = create(:product, images: legacy)
    described_class.new.up
    expect(other.reload.images).to eq(legacy)
  end

  it "allows an empty catalog so create-only seeds can run after migration" do
    expect { described_class.new.up }.not_to change(Product, :count)
  end

  it "refuses rollback because it cannot safely identify later merchant selections" do
    expect { described_class.new.down }.to raise_error(ActiveRecord::IrreversibleMigration, /merchant/)
  end
end
