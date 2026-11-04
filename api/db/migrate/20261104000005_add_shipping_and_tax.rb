# Real shipping and the tax switch. Everything is additive, with defaults or null, so
# the release still serving during pre-deploy keeps working: it never reads the new
# columns, and an order it creates has no shipping, so its total still equals its subtotal.
class AddShippingAndTax < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :shipping_cents, :integer, null: false, default: 0
    add_column :orders, :tax_cents, :integer, null: false, default: 0
    add_column :orders, :shipping_method, :jsonb
    add_column :orders, :fulfillment_method, :string, null: false, default: "ship"
    add_check_constraint :orders, "shipping_cents >= 0 AND tax_cents >= 0 AND fulfillment_method IN ('ship', 'pickup')", name: "order_shipping_valid"

    # One EasyPost shipment can only ever belong to one order, so a quote used twice
    # can't hand the same label to two orders. It's saved before any label is bought.
    add_column :orders, :label_shipment_id, :string
    add_column :orders, :label_status, :string
    add_column :orders, :label_url, :text
    add_column :orders, :label_cost_cents, :integer
    add_column :orders, :label_bought_at, :datetime
    add_column :orders, :tracking_status, :string
    add_column :orders, :tracking_status_at, :datetime
    add_index :orders, :label_shipment_id, unique: true, where: "label_shipment_id IS NOT NULL", name: "one_order_per_label_shipment"

    add_column :products, :weight_oz, :decimal, precision: 8, scale: 2
    add_column :products, :length_in, :decimal, precision: 6, scale: 2
    add_column :products, :width_in, :decimal, precision: 6, scale: 2
    add_column :products, :height_in, :decimal, precision: 6, scale: 2
    add_check_constraint :products, <<~SQL.squish, name: "product_parcel_valid"
      (weight_oz IS NULL OR weight_oz > 0) AND (length_in IS NULL OR length_in > 0)
      AND (width_in IS NULL OR width_in > 0) AND (height_in IS NULL OR height_in > 0)
    SQL

    add_column :store_settings, :tax_enabled, :boolean, null: false, default: false
    add_column :store_settings, :shipping_settings, :jsonb, null: false, default: {}
    # Flat rates are placeholders until the merchant saves real ones.
    add_column :store_settings, :flat_rates_saved_at, :datetime

    # Signed carrier events. order_id stays null for one that matches no order.
    create_table :shipping_events do |t|
      t.references :order, foreign_key: true
      t.string :event_id, null: false
      t.string :event_type, null: false
      t.string :shipment_id
      t.string :tracking_code
      t.string :status
      t.datetime :occurred_at
      t.timestamps
    end
    add_index :shipping_events, :event_id, unique: true
  end
end
