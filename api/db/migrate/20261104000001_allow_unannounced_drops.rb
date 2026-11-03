# Drop 001 cannot ship on its placeholder date: the map is now a China production
# run with about 60 days of lead time. Release dates become optional, and an
# undated drop is "coming soon". Only the untouched seed values are changed.
class AllowUnannouncedDrops < ActiveRecord::Migration[8.1]
  SEEDED_COPY = " Drop 001 is a single release of 100 puzzles.".freeze

  def up
    change_column_null :drops, :release_at, true
    execute <<~SQL.squish
      UPDATE drops SET release_at = NULL, updated_at = NOW()
      WHERE slug = 'drop-001-guahan-sunset-map' AND release_at = TIMESTAMP '2026-12-05 00:00:00'
        AND NOT EXISTS (SELECT 1 FROM products p JOIN order_items i ON i.product_id = p.id WHERE p.drop_id = drops.id)
    SQL
    execute <<~SQL.squish
      UPDATE products SET description = REPLACE(description, #{connection.quote(SEEDED_COPY)}, ' Drop 001 is a one-time release.'), updated_at = NOW()
      WHERE slug = 'guahan-sunset-map' AND description LIKE '%' || #{connection.quote(SEEDED_COPY)}
    SQL
  end

  def down
    execute "UPDATE drops SET release_at = TIMESTAMP '2026-12-05 00:00:00' WHERE release_at IS NULL"
    change_column_null :drops, :release_at, false
  end
end
