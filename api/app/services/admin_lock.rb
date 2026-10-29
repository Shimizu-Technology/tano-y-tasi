module AdminLock
  # Session advisory locks serialize provider work without an open transaction.
  def self.with(key)
    ActiveRecord::Base.connection_pool.with_connection do |connection|
      lock_id = query_attribute(key)
      connection.exec_query("SELECT 1 FROM pg_advisory_lock($1)", "AdminLock", [ lock_id ])
      begin
        yield
      ensure
        connection.exec_query("SELECT pg_advisory_unlock($1)", "AdminLock", [ lock_id ])
      end
    end
  end

  # Transaction advisory locks share PostgreSQL's advisory-lock namespace with
  # session locks, but release automatically at the end of the transaction.
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
