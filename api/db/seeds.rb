# Catalog defaults are create-only: deploys must never undo merchant edits.
drop = Drop.find_or_create_by!(slug: "drop-001-guahan-sunset-map") do |record|
  record.assign_attributes(release_at: nil, quantity: 500,
    number: 1, name: "Guåhan Sunset Map", per_customer_limit: 2)
end

image = lambda do |slug, file, widths, aspect, role, alt|
  { role: role, alt: alt, base: "/images/products/#{slug}/#{file}", widths: widths, aspect: aspect }
end
core_slug = "hafa-adai-from-tumon-bay"
core = Product.find_or_create_by!(slug: core_slug) do |record|
  record.assign_attributes(stock_quantity: 50, name: "Håfa Adai from Tumon Bay", kind: "core", status: "active", price_cents: 3500, currency: "USD", position: 1,
    summary: "The GUAM sign at Tumon Bay, 100 pieces.",
    description: "A familiar welcome by the water. Piece together the GUAM sign at Tumon Bay, with palms overhead and the reef just beyond. A small reminder of home, made for a quiet afternoon.",
    specs: { piece_count: 100, finished_size: "12 × 9 in", box_size: "TBD", material: "TBD", cut: "Classic", made_in: "USA" },
    includes: [ "100-piece puzzle", "Keepsake box" ],
    art: { credit: "Photo: Christian Tenorio (to confirm)", story: "Håfa Adai from the shore of Tumon Bay, Guåhan." },
    placeholders: [ "price_cents", "stock_quantity", "specs.box_size", "specs.material", "specs.cut", "specs.made_in", "includes", "art.credit" ],
    images: [
      image.call(core_slug, "finished-flat", [ 640, 1280, 2000 ], "12:7", "hero", "Finished puzzle of the colorful GUAM sign at Tumon Bay, with blue water and open sky."),
      image.call(core_slug, "piece-detail", [ 640, 1071 ], "4:3", "detail", "Close view of interlocking pieces in the Tumon Bay puzzle."),
      image.call(core_slug, "finished-tabletop", [ 640, 1280, 2000 ], "3:4", "lifestyle", "Finished Håfa Adai puzzle on a tabletop, showing the GUAM sign and Tumon Bay.") ])
end

map_slug = "guahan-sunset-map"
map = Product.find_or_create_by!(slug: map_slug) do |record|
  record.assign_attributes(stock_quantity: 500, drop: drop, name: "Guåhan Sunset Map", kind: "drop", status: "active", price_cents: 4500, currency: "USD", position: 2,
    summary: "An illustrated map of Guåhan, from village streets to the coastline.",
    description: "Find your way around Guåhan, one piece at a time. This illustrated map brings together the island's villages and landmarks, from Hagåtña to Humåtak, with little details to discover along the way. Drop 001 is a one-time release.",
    specs: { piece_count: 500, finished_size: "16 × 20 in", box_size: "TBD", material: "TBD", cut: "Classic", made_in: "TBD" },
    includes: [ "500-piece puzzle", "Keepsake box" ],
    art: { credit: "Illustration credit to be confirmed", story: "A sunset-colored portrait of our island, its places, and its ko'ko'." },
    placeholders: [ "price_cents", "stock_quantity", "drop.quantity", "drop.release_at", "specs.piece_count", "specs.finished_size", "specs.box_size", "specs.material", "specs.cut", "specs.made_in", "includes", "art.credit" ],
    images: [
      image.call(map_slug, "artwork", [ 640, 1280, 2000, 2800 ], "509:640", "hero", "Illustrated map of Guåhan in sunset colors, showing villages and coastal landmarks."),
      image.call(map_slug, "detail-two-lovers-point", [ 640, 1280, 2000 ], "4:3", "detail", "Map detail showing Two Lovers Point on Guåhan's northern coast."),
      image.call(map_slug, "detail-humatak", [ 640, 1280, 2000 ], "4:3", "detail", "Illustrated map detail of Humåtak and its bay."),
      image.call(map_slug, "detail-koko", [ 640, 1280, 2000 ], "4:3", "detail", "A ko'ko' bird among the small illustrations on the Guåhan map.") ])
end
StoreSetting.current
{ "shipping" => "Shipping", "returns" => "Returns & refunds", "privacy" => "Privacy policy", "terms" => "Terms" }.each do |slug, title|
  Page.find_or_create_by!(slug: slug) do |page|
    page.assign_attributes(title: title, body: Rails.root.join("db/policies/#{slug}.md").read)
  end
end
puts "Seeded #{core.name} and #{map.name}; existing catalog preserved."
