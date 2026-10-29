class RefreshCorePuzzleImages < ActiveRecord::Migration[8.1]
  class CatalogProduct < ActiveRecord::Base
    self.table_name = "products"
  end

  def up
    image = lambda do |file, widths, aspect, role, alt|
      { role: role, alt: alt, base: "/images/products/hafa-adai-from-tumon-bay/#{file}", widths: widths, aspect: aspect }
    end
    legacy = [
      image.call("finished-tabletop", [ 640, 1280, 2000 ], "3:4", "hero", "Finished Håfa Adai puzzle on a tabletop, showing the GUAM sign and Tumon Bay."),
      image.call("finished-square", [ 640, 1280, 2000 ], "1:1", "gallery", "The completed Tumon Bay puzzle, with the GUAM sign, palms, and blue water."),
      image.call("box-front", [ 640, 952 ], "952:800", "box", "Front of the Håfa Adai from Tumon Bay puzzle box."),
      image.call("piece-detail", [ 640, 1071 ], "4:3", "detail", "Close view of interlocking pieces in the Tumon Bay puzzle."),
      image.call("finished-landscape", [ 1280, 2000, 2800 ], "4:3", "lifestyle", "The finished Tumon Bay puzzle laid out in a wide view.") ]
    replacement = [
      image.call("finished-flat", [ 640, 1280, 2000 ], "12:7", "hero", "Finished puzzle of the colorful GUAM sign at Tumon Bay, with blue water and open sky."),
      image.call("piece-detail", [ 640, 1071 ], "4:3", "detail", "Close view of interlocking pieces in the Tumon Bay puzzle."),
      image.call("finished-tabletop", [ 640, 1280, 2000 ], "3:4", "lifestyle", "Finished Håfa Adai puzzle on a tabletop, showing the GUAM sign and Tumon Bay.") ]
    # Compare and update in one SQL statement: a concurrent merchant edit must win.
    # JSONB equality ignores object key order but preserves every value and array order.
    CatalogProduct.where(slug: "hafa-adai-from-tumon-bay").where("images = ?::jsonb", legacy.to_json).update_all(images: replacement)
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Cannot distinguish migrated images from a merchant's later selection; restoring the misprinted box would risk overwriting their work."
  end
end
