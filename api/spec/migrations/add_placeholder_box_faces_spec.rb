require "rails_helper"
require Rails.root.join("db/migrate/20261113000001_add_placeholder_box_faces")

RSpec.describe AddPlaceholderBoxFaces do
  let(:product) { create(:product, slug: "guahan-sunset-map") }

  it "appends the four stand-in faces once, after the product's own images" do
    own = product.images
    described_class.new.up
    expect(product.reload.images.take(own.size)).to eq(own)
    expect(product.box.transform_values { |face| face["base"].split("/").last }).to eq(
      front: "box-placeholder-front", back: "box-placeholder-back", left: "box-placeholder-left", right: "box-placeholder-right")
    expect(product).to be_valid
    images = product.images
    described_class.new.up
    expect(product.reload.images).to eq(images)
    described_class.new.down
    expect(product.reload.images).to eq(own)
  end

  it "leaves a product that already has a box face, has no images, or is another product" do
    front = product.images.first.merge("role" => "box_front", "base" => "/images/merchant-box")
    [ product.images + [ front ], [] ].each do |images|
      product.update_columns(images: images)
      described_class.new.up
      expect(product.reload.images).to eq(images)
    end
    other = create(:product, slug: "another-puzzle")
    expect { described_class.new.up }.not_to change { other.reload.images }
  end
end
