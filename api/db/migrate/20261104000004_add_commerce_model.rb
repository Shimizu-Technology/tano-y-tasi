# Fits the catalog to how the store really runs: signature products, per-product
# limits, several products in a drop, preorders and production runs. Everything is
# additive, so the release still serving during pre-deploy keeps working: it never
# reads the new columns, and its own validation still allows one product per drop.
class AddCommerceModel < ActiveRecord::Migration[8.1]
  def up
    add_column :products, :signature, :boolean, null: false, default: false
    add_column :products, :per_customer_limit, :integer
    add_column :products, :preorder, :boolean, null: false, default: false
    add_column :products, :preorder_ships, :string
    add_check_constraint :products, "per_customer_limit IS NULL OR per_customer_limit > 0", name: "product_limit_valid"
    add_check_constraint :products, "NOT preorder OR COALESCE(BTRIM(preorder_ships), '') <> ''", name: "preorder_says_when_it_ships"

    # A snapshot, so editing the product later can't rewrite an order.
    add_column :order_items, :preorder_ships, :string

    remove_index :products, name: "one_product_per_drop"

    create_table :production_runs do |t|
      t.references :product, null: false, foreign_key: true
      t.integer :quantity, null: false
      t.string :status, null: false, default: "ordered"
      t.string :supplier
      t.integer :unit_cost_cents
      t.date :expected_at
      t.datetime :received_at
      t.integer :stock_added
      t.text :notes
      t.timestamps
    end
    add_check_constraint :production_runs, <<~SQL.squish, name: "production_run_valid"
      quantity > 0 AND status IN ('ordered', 'received', 'canceled')
      AND (unit_cost_cents IS NULL OR unit_cost_cents >= 0)
      AND (stock_added IS NULL OR stock_added >= 0)
      AND (status = 'received') = (received_at IS NOT NULL)
      AND (status = 'received') = (stock_added IS NOT NULL)
    SQL

    # The hard stop behind receiving: a run can only ever add stock once.
    add_reference :inventory_movements, :production_run, foreign_key: true, index: false
    add_index :inventory_movements, :production_run_id, unique: true, where: "production_run_id IS NOT NULL", name: "one_movement_per_production_run"
  end

  def down
    if select_value("SELECT 1 FROM products WHERE drop_id IS NOT NULL GROUP BY drop_id HAVING COUNT(*) > 1 LIMIT 1")
      raise ActiveRecord::IrreversibleMigration, "Leave each drop with one product before rolling back."
    end
    remove_index :inventory_movements, name: "one_movement_per_production_run"
    remove_reference :inventory_movements, :production_run, foreign_key: true, index: false
    drop_table :production_runs
    add_index :products, :drop_id, unique: true, where: "drop_id IS NOT NULL", name: "one_product_per_drop"
    remove_column :order_items, :preorder_ships
    remove_check_constraint :products, name: "preorder_says_when_it_ships"
    remove_check_constraint :products, name: "product_limit_valid"
    remove_column :products, :preorder_ships
    remove_column :products, :preorder
    remove_column :products, :per_customer_limit
    remove_column :products, :signature
  end
end
