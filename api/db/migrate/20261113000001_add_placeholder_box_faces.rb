class AddPlaceholderBoxFaces < ActiveRecord::Migration[8.1]
  class CatalogProduct < ActiveRecord::Base
    self.table_name = "products"
  end

  BOXES = {
    "hafa-adai-from-tumon-bay" => [ "Håfa Adai from Tumon Bay", [ 640, 1280 ], "4:3", "1:5" ],
    "guahan-sunset-map" => [ "Guåhan Sunset Map", [ 512, 1024 ], "4:5", "3:20" ]
  }.freeze

  # Gives the two launch puzzles stand-in box faces so their boxes can turn before the real box art exists.
  def up
    BOXES.each do |slug, (name, widths, aspect, side_aspect)|
      faces = [ [ "front", widths, aspect, "Front" ], [ "back", widths, aspect, "Back" ], [ "left", [ 96, 192 ], side_aspect, "Side" ], [ "right", [ 96, 192 ], side_aspect, "Side" ] ].map do |face, sizes, shape, label|
        { role: "box_#{face}", alt: "#{label} of the #{name} puzzle box.", base: "/images/products/#{slug}/box-placeholder-#{face}", widths: sizes, aspect: shape }
      end
      # One statement, so a merchant's concurrent edit wins. A product that already has box faces, or no images, is left alone.
      CatalogProduct.where(slug: slug).where("jsonb_array_length(images) > 0")
        .where("NOT EXISTS (SELECT 1 FROM jsonb_array_elements(images) image WHERE image->>'role' LIKE 'box\\_%')")
        .update_all([ "images = images || ?::jsonb", faces.to_json ])
    end
  end

  def down
    bases = BOXES.keys.flat_map { |slug| %w[front back left right].map { |face| "/images/products/#{slug}/box-placeholder-#{face}" } }
    # One statement here too: it filters the list as it stands, in order, so a concurrent edit isn't overwritten.
    CatalogProduct.where(slug: BOXES.keys).update_all([ <<~SQL.squish, bases ])
      images = COALESCE((SELECT jsonb_agg(image ORDER BY position) FROM jsonb_array_elements(images) WITH ORDINALITY AS list(image, position)
        WHERE NOT (image->>'base' = ANY(ARRAY[?]))), '[]'::jsonb)
    SQL
  end
end
