class AddStoreSettingsAndPages < ActiveRecord::Migration[8.1]
  class MigrationOrder < ActiveRecord::Base
    self.table_name = "orders"
  end

  def up
    create_table :store_settings do |t|
      t.boolean :sales_open, null: false, default: false
      t.string :contact_email, null: false, default: "shimizutechnology@gmail.com"
      t.string :tagline, null: false, default: "A piece of home."
      t.string :secondary_tagline, null: false, default: "Grounded by land, guided by sea."
      t.text :story, null: false, default: "Land and sea define our islands, but our culture extends beyond their shores. Tåno y Tåsi exists to keep us connected to where we come from, carrying a piece of home wherever we are."
      t.jsonb :mission_lines, null: false, default: [ "Keeping us connected to where we come from.", "Carrying a piece of home wherever we are." ]
      t.timestamps
    end
    # Exactly one row: every store setting lives here.
    add_index :store_settings, "(true)", unique: true, name: "one_store_settings_row"

    create_table :pages do |t|
      t.string :slug, null: false
      t.string :title, null: false
      t.text :body, null: false
      t.timestamps
    end
    add_index :pages, :slug, unique: true

    # #23 wrote this column for every new order, so it can be enforced now.
    MigrationOrder.where(customer_key: nil).find_each { |order| order.update_columns(customer_key: Order.customer_key_for(order.email)) }
    change_column_null :orders, :customer_key, false
  end

  def down
    change_column_null :orders, :customer_key, true
    drop_table :pages
    drop_table :store_settings
  end
end
