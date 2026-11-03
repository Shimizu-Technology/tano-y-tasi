# Serializes work around external providers without holding a transaction or a
# database lock during the network call. A crashed holder's row expires on its own.
class ProviderLease < ApplicationRecord
  self.primary_key = "key"

  class Busy < StandardError; end

  # Longer than one Stripe call with its retries, so a live holder keeps its lease.
  TTL = 5.minutes
  WAIT = 15.seconds
  POLL = 0.1

  def self.with(key, ttl: TTL, wait: WAIT)
    holder = SecureRandom.hex(16)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + wait.to_f
    until acquire(key, holder, ttl)
      raise Busy, key if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep POLL
    end
    begin
      yield
    ensure
      where(key: key, holder: holder).delete_all
    end
  end

  def self.acquire(key, holder, ttl)
    sql = sanitize_sql_array([ <<~SQL.squish, key, holder, ttl.to_i ])
      INSERT INTO provider_leases (key, holder, expires_at)
      VALUES (?, ?, (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ?))
      ON CONFLICT (key) DO UPDATE SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
      WHERE provider_leases.expires_at < (NOW() AT TIME ZONE 'UTC')
      RETURNING key
    SQL
    connection.exec_query(sql, "ProviderLease").any?
  end
  private_class_method :acquire

  def self.purge_expired
    where(expires_at: ...Time.current).delete_all
  end
end
