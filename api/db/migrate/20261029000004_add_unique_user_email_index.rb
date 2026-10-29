class AddUniqueUserEmailIndex < ActiveRecord::Migration[8.1]
  def change
    add_index :users, "lower(email)", unique: true, name: "users_email_unique"
  end
end
