# Catalog attributes are upserted; existing stock and lifecycle are preserved.
drop = Drop.find_or_initialize_by(slug: "drop-001-guahan-sunset-map")
if drop.new_record?
  drop.assign_attributes(release_at: Time.iso8601("2026-12-05T00:00:00Z"), quantity: 100)
end
drop.assign_attributes(number: 1, name: "Guåhan Sunset Map", per_customer_limit: 2)
drop.save!

image = lambda do |slug, file, widths, aspect, role, alt|
  { role: role, alt: alt, base: "/images/products/#{slug}/#{file}", widths: widths, aspect: aspect }
end
core_slug = "hafa-adai-from-tumon-bay"
core = Product.find_or_initialize_by(slug: core_slug)
core.stock_quantity = 50 if core.new_record?
core.assign_attributes(name: "Håfa Adai from Tumon Bay", kind: "core", status: "active", price_cents: 3500, currency: "USD", position: 1,
  summary: "The GUAM sign at Tumon Bay, 100 pieces.",
  description: "A familiar welcome by the water. Piece together the GUAM sign at Tumon Bay, with palms overhead and the reef just beyond. A small reminder of home, made for a quiet afternoon.",
  specs: { piece_count: 100, finished_size: "12 × 9 in", box_size: "TBD", material: "TBD", cut: "Classic", made_in: "USA" },
  includes: [ "100-piece puzzle", "Keepsake box" ],
  art: { credit: "Photo: Christian Tenorio (to confirm)", story: "Håfa Adai from the shore of Tumon Bay, Guåhan." },
  placeholders: [ "price_cents", "stock_quantity", "specs.box_size", "specs.material", "specs.cut", "specs.made_in", "includes", "art.credit" ],
  images: [
    image.call(core_slug, "finished-tabletop", [ 640, 1280, 2000 ], "3:4", "hero", "Finished Håfa Adai puzzle on a tabletop, showing the GUAM sign and Tumon Bay."),
    image.call(core_slug, "finished-square", [ 640, 1280, 2000 ], "1:1", "gallery", "The completed Tumon Bay puzzle, with the GUAM sign, palms, and blue water."),
    image.call(core_slug, "box-front", [ 640, 952 ], "952:800", "box", "Front of the Håfa Adai from Tumon Bay puzzle box."),
    image.call(core_slug, "piece-detail", [ 640, 1071 ], "4:3", "detail", "Close view of interlocking pieces in the Tumon Bay puzzle."),
    image.call(core_slug, "finished-landscape", [ 1280, 2000, 2800 ], "4:3", "lifestyle", "The finished Tumon Bay puzzle laid out in a wide view.") ])
core.save!

map_slug = "guahan-sunset-map"
map = Product.find_or_initialize_by(slug: map_slug)
map.stock_quantity = 100 if map.new_record?
map.assign_attributes(drop: drop, name: "Guåhan Sunset Map", kind: "drop", status: "active", price_cents: 4500, currency: "USD", position: 2,
  summary: "An illustrated map of Guåhan, from village streets to the coastline.",
  description: "Find your way around Guåhan, one piece at a time. This illustrated map brings together the island's villages and landmarks, from Hagåtña to Humåtak, with little details to discover along the way. Drop 001 is a single release of 100 puzzles.",
  specs: { piece_count: 500, finished_size: "16 × 20 in", box_size: "TBD", material: "TBD", cut: "Classic", made_in: "TBD" },
  includes: [ "500-piece puzzle", "Keepsake box" ],
  art: { credit: "Illustration credit to be confirmed", story: "A sunset-colored portrait of our island, its places, and its ko'ko'." },
  placeholders: [ "price_cents", "stock_quantity", "drop.quantity", "drop.release_at", "specs.piece_count", "specs.finished_size", "specs.box_size", "specs.material", "specs.cut", "specs.made_in", "includes", "art.credit" ],
  images: [
    image.call(map_slug, "artwork", [ 640, 1280, 2000, 2800 ], "509:640", "hero", "Illustrated map of Guåhan in sunset colors, showing villages and coastal landmarks."),
    image.call(map_slug, "detail-two-lovers-point", [ 640, 1280, 2000 ], "4:3", "detail", "Map detail showing Two Lovers Point on Guåhan's northern coast."),
    image.call(map_slug, "detail-humatak", [ 640, 1280, 2000 ], "4:3", "detail", "Illustrated map detail of Humåtak and its bay."),
    image.call(map_slug, "detail-koko", [ 640, 1280, 2000 ], "4:3", "detail", "A ko'ko' bird among the small illustrations on the Guåhan map.") ])
map.save!
puts "Seeded #{core.name} and #{map.name}; existing inventory preserved."
