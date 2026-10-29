module AdminLock
  # Session advisory locks serialize provider work without an open transaction.
  def self.with(key)
    ActiveRecord::Base.connection_pool.with_connection do |connection|
      id = Digest::SHA256.digest(key).unpack1("q>")
      connection.execute("SELECT pg_advisory_lock(#{id})")
      begin
        yield
      ensure
        connection.execute("SELECT pg_advisory_unlock(#{id})")
      end
    end
  end
end
