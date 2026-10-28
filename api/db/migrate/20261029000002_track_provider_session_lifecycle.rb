class TrackProviderSessionLifecycle < ActiveRecord::Migration[8.1]
  def change
    add_column :orders, :provider_session_expires_at, :datetime
    add_column :orders, :provider_session_closed_at, :datetime
    add_index :orders, :updated_at, where: "provider = 'stripe' AND status IN ('canceled', 'expired') AND provider_session_id IS NOT NULL AND provider_session_closed_at IS NULL",
      name: "orders_unclosed_sessions"
  end
end
