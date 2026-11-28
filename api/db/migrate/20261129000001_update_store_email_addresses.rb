class UpdateStoreEmailAddresses < ActiveRecord::Migration[8.1]
  def up
    change_column_default :store_settings, :contact_email,
      from: "shimizutechnology@gmail.com", to: "hello@shimizu-technology.com"

    execute <<~SQL
      UPDATE store_settings
      SET contact_email = 'hello@shimizu-technology.com', updated_at = CURRENT_TIMESTAMP
      WHERE lower(contact_email) = 'shimizutechnology@gmail.com'
    SQL

    execute <<~SQL
      UPDATE pages
      SET body = regexp_replace(body, 'shimizutechnology@gmail[.]com', 'support@shimizu-technology.com', 'gi'),
          updated_at = CURRENT_TIMESTAMP
      WHERE slug IN ('shipping', 'returns', 'privacy', 'terms')
        AND body ~* 'shimizutechnology@gmail[.]com'
    SQL
  end

  def down
    change_column_default :store_settings, :contact_email,
      from: "hello@shimizu-technology.com", to: "shimizutechnology@gmail.com"
  end
end
