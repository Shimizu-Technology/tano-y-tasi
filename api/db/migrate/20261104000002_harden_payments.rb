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
    add_column :orders, :charged_cents, :integer
    add_column :orders, :refunded_cents, :integer, null: false, default: 0
    add_column :orders, :refunded_at, :datetime
    add_column :orders, :dispute_status, :string
    add_column :orders, :failed_refund_ids, :jsonb, null: false, default: []
    # Stays nullable for this release: the previous release keeps serving while the
    # pre-deploy migration runs and doesn't know this column. Enforced in a later migration.
    add_column :orders, :customer_key, :string
    add_check_constraint :orders, "refunded_cents >= 0 AND (charged_cents IS NULL OR charged_cents >= 0)", name: "order_refund_valid"
    MigrationOrder.reset_column_information
    MigrationOrder.find_each { |order| order.update_columns(customer_key: Order.customer_key_for(order.email)) }
    add_index :orders, :customer_key

    # An admin refund is recorded before calling Stripe, so retrying an uncertain
    # request reuses its idempotency key however the order changes in between.
    create_table :refund_requests do |t|
      t.references :order, null: false, foreign_key: true
      t.integer :amount_cents, null: false
      t.string :status, null: false, default: "open"
      t.string :idempotency_key, null: false
      t.string :provider_refund_id
      t.timestamps
    end
    add_index :refund_requests, :idempotency_key, unique: true
    add_index :refund_requests, :order_id, unique: true, where: "status = 'open'", name: "one_open_refund_request"
    add_check_constraint :refund_requests, "amount_cents > 0 AND status IN ('open', 'completed', 'rejected')", name: "refund_request_valid"

    # Stripe does not guarantee event order. A refund or dispute that arrives before
    # its payment stays unprocessed here until the payment is recorded.
    add_column :payment_events, :payment_intent_id, :string
    add_index :payment_events, :payment_intent_id, where: "processed_at IS NULL", name: "unresolved_payment_events"
  end

  def down
    remove_index :payment_events, name: "unresolved_payment_events"
    remove_column :payment_events, :payment_intent_id
    drop_table :refund_requests
    remove_index :orders, :customer_key
    remove_check_constraint :orders, name: "order_refund_valid"
    remove_column :orders, :customer_key
    remove_column :orders, :failed_refund_ids
    remove_column :orders, :dispute_status
    remove_column :orders, :refunded_at
    remove_column :orders, :refunded_cents
    remove_column :orders, :charged_cents
    remove_column :orders, :attention_reason
    drop_table :provider_leases
  end
end
