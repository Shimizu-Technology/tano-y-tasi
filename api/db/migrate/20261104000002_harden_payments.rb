class HardenPayments < ActiveRecord::Migration[8.1]
  class MigrationOrder < ActiveRecord::Base
    self.table_name = "orders"
  end

  def up
    # Neon's pooled URL runs PgBouncer in transaction mode, so session advisory
    # locks are unsafe at runtime. Provider work is serialized by these rows instead.
    create_table :provider_leases, id: false do |t|
      t.string :key, null: false, primary_key: true
      t.string :holder, null: false
      t.datetime :expires_at, null: false
    end
    add_column :orders, :attention_reason, :string
    add_column :orders, :refunded_cents, :integer, null: false, default: 0
    add_column :orders, :refunded_at, :datetime
    add_column :orders, :dispute_status, :string
    add_column :orders, :customer_key, :string
    add_check_constraint :orders, "refunded_cents >= 0 AND refunded_cents <= total_cents", name: "order_refund_valid"
    MigrationOrder.reset_column_information
    MigrationOrder.find_each { |order| order.update_columns(customer_key: Order.customer_key_for(order.email)) }
    change_column_null :orders, :customer_key, false
    add_index :orders, :customer_key
  end

  def down
    remove_index :orders, :customer_key
    remove_check_constraint :orders, name: "order_refund_valid"
    remove_column :orders, :customer_key
    remove_column :orders, :dispute_status
    remove_column :orders, :refunded_at
    remove_column :orders, :refunded_cents
    remove_column :orders, :attention_reason
    drop_table :provider_leases
  end
end
