module AdminLock
  # Transaction advisory locks release automatically at the end of the transaction,
  # which is the only advisory-lock form that is safe through the Neon pooler.
  def self.with_transaction(key)
    ActiveRecord::Base.transaction(requires_new: true) do
      lock_id = query_attribute(key)
      ActiveRecord::Base.connection.exec_query("SELECT 1 FROM pg_advisory_xact_lock($1)", "AdminLock", [ lock_id ])
      yield
    end
  end

  def self.admin_email_key(email)
    "admin-email:#{email.to_s.strip.downcase}"
  end

  def self.query_attribute(key)
    id = Digest::SHA256.digest(key).unpack1("q>")
    ActiveRecord::Relation::QueryAttribute.new("lock_id", id, ActiveRecord::Type::Integer.new(limit: 8))
  end
  private_class_method :query_attribute
end
