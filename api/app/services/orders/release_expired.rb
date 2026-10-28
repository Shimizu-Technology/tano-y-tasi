module Orders
  class ReleaseExpired
    BATCH_SIZE = 100

    def self.call
      cutoff = Time.current - 5.minutes
      Order.holding.where(expires_at: ...cutoff).order(:expires_at).limit(BATCH_SIZE).each do |order|
        Release.call(order, status: "expired", expired_before: cutoff)
      end
    end
  end
end
