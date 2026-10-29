class AddAdminAndEmail < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :clerk_id, null: false
      t.string :email, null: false
      t.string :name
      t.string :role, null: false, default: "admin"
      t.boolean :active, null: false, default: true
      t.datetime :last_signed_in_at
      t.timestamps
    end
    add_index :users, :clerk_id, unique: true
    add_check_constraint :users, "role = 'admin' AND email = lower(btrim(email))", name: "admin_identity_valid"
    create_table :admin_invitations do |t|
      t.string :email, null: false
      t.string :clerk_invitation_id
      t.datetime :accepted_at
      t.datetime :revoked_at
      t.references :invited_by, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_index :admin_invitations, :email, unique: true, where: "accepted_at IS NULL AND revoked_at IS NULL", name: "one_pending_admin_invitation"
    add_check_constraint :admin_invitations, "email = lower(btrim(email))", name: "invitation_email_normalized"
    add_column :orders, :fulfillment_status, :string, null: false, default: "unfulfilled"
    add_column :orders, :tracking_number, :string
    add_column :orders, :tracking_url, :string
    add_column :orders, :fulfilled_at, :datetime
    add_column :orders, :notes, :text
    add_check_constraint :orders, "fulfillment_status IN ('unfulfilled', 'fulfilled')", name: "fulfillment_status_valid"
    change_column_null :inventory_movements, :order_id, true
    add_column :inventory_movements, :note, :text
    create_table :email_deliveries do |t|
      t.references :order, null: false, foreign_key: { on_delete: :cascade }
      t.string :kind, null: false
      t.string :to, null: false
      t.string :subject, null: false
      t.string :status, null: false, default: "pending"
      t.integer :attempts, null: false, default: 0
      t.integer :resend_number, null: false, default: 0
      t.jsonb :outbound_payload, null: false, default: {}
      t.text :last_error
      t.string :provider_message_id
      t.datetime :sent_at
      t.timestamps
    end
    add_index :email_deliveries, [ :order_id, :kind, :to ], unique: true
    add_check_constraint :email_deliveries, "status IN ('pending', 'sent', 'failed', 'skipped') AND attempts >= 0", name: "email_delivery_valid"
  end
end
