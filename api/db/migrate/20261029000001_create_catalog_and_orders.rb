class CreateCatalogAndOrders < ActiveRecord::Migration[8.1]
  def change
    create_table :drops do |t|
      t.string :slug, null: false
      t.integer :number, null: false
      t.string :name, null: false
      t.datetime :release_at, null: false
      t.datetime :closes_at
      t.datetime :sold_out_at
      t.integer :quantity, null: false
      t.integer :per_customer_limit, null: false, default: 2
      t.timestamps
    end
    add_index :drops, :slug, unique: true
    add_index :drops, :number, unique: true
    add_check_constraint :drops, "quantity >= 0 AND per_customer_limit > 0", name: "drop_quantities_valid"

    create_table :products do |t|
      t.references :drop, foreign_key: true
      t.string :slug, null: false
      t.string :name, null: false
      t.string :kind, null: false, default: "core"
      t.string :status, null: false, default: "active"
      t.integer :price_cents, null: false
      t.string :currency, null: false, default: "USD"
      t.text :summary, null: false
      t.text :description, null: false
      t.jsonb :specs, null: false, default: {}
      t.jsonb :includes, null: false, default: []
      t.jsonb :art, null: false, default: {}
      t.jsonb :images, null: false, default: []
      t.jsonb :placeholders, null: false, default: []
      t.integer :stock_quantity, null: false, default: 0
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :products, :slug, unique: true
    add_index :products, :drop_id, unique: true, where: "drop_id IS NOT NULL", name: "one_product_per_drop"
    add_check_constraint :products, "stock_quantity >= 0", name: "stock_nonnegative"
    add_check_constraint :products, "price_cents >= 0 AND currency = 'USD'", name: "product_price_valid"
    add_check_constraint :products, "kind IN ('core', 'drop') AND status IN ('draft', 'active', 'archived')", name: "product_states_valid"
    add_check_constraint :products, "(kind = 'drop' AND drop_id IS NOT NULL) OR (kind = 'core' AND drop_id IS NULL)", name: "product_drop_consistent"

    reversible do |dir|
      dir.up { execute "CREATE SEQUENCE order_numbers START WITH 100001" }
      dir.down { execute "DROP SEQUENCE order_numbers" }
    end
    create_table :orders do |t|
      t.string :token, null: false
      t.string :number, null: false, default: -> { "'TYT-' || nextval('order_numbers')::text" }
      t.string :email, null: false
      t.string :status, null: false, default: "pending_payment"
      t.integer :subtotal_cents, null: false
      t.integer :total_cents, null: false
      t.string :currency, null: false, default: "USD"
      t.string :idempotency_key, null: false
      t.string :request_fingerprint, null: false
      t.datetime :expires_at, null: false
      t.datetime :paid_at
      t.string :provider, null: false
      t.string :provider_session_id
      t.string :provider_payment_intent_id
      t.text :payment_url
      t.jsonb :shipping, null: false, default: {}
      t.timestamps
    end
    %i[token number idempotency_key].each { |column| add_index :orders, column, unique: true }
    %i[provider_session_id provider_payment_intent_id].each do |column|
      add_index :orders, column, unique: true, where: "#{column} IS NOT NULL"
    end
    add_index :orders, [ :status, :expires_at ]
    add_index :orders, :email
    add_check_constraint :orders, "email = lower(btrim(email))", name: "order_email_normalized"
    add_check_constraint :orders, "status IN ('pending_payment', 'paid', 'expired', 'canceled', 'refunded', 'needs_attention')", name: "order_status_valid"
    add_check_constraint :orders, "subtotal_cents >= 0 AND total_cents >= 0 AND currency = 'USD'", name: "order_totals_valid"

    create_table :order_items do |t|
      t.references :order, null: false, foreign_key: true
      t.references :product, null: false, foreign_key: true
      t.string :product_slug, null: false
      t.string :name, null: false
      t.integer :quantity, null: false
      t.integer :unit_price_cents, null: false
      t.jsonb :image, null: false, default: {}
      t.timestamps
    end
    add_index :order_items, [ :order_id, :product_id ], unique: true
    add_check_constraint :order_items, "quantity > 0 AND unit_price_cents >= 0", name: "item_amounts_valid"

    create_table :payment_events do |t|
      t.string :provider, null: false
      t.string :event_id, null: false
      t.string :event_type, null: false
      t.datetime :processed_at
      t.timestamps
    end
    add_index :payment_events, :event_id, unique: true

    create_table :subscribers do |t|
      t.string :email, null: false
      t.string :source
      t.string :drop_slug
      t.timestamps
    end
    add_index :subscribers, "lower(email)", unique: true, name: "subscribers_email_unique"

    create_table :inventory_movements do |t|
      t.references :product, null: false, foreign_key: true
      t.references :order, null: false, foreign_key: true
      t.integer :delta, null: false
      t.integer :balance, null: false
      t.string :reason, null: false
      t.timestamps
    end
    add_check_constraint :inventory_movements, "balance >= 0 AND delta <> 0", name: "inventory_movement_valid"
  end
end
