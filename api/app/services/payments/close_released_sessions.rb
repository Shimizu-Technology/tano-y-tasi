module Payments
  class CloseReleasedSessions
    BATCH_SIZE = 100

    def self.call
      Order.where(provider: "stripe", status: %w[canceled expired], provider_session_closed_at: nil)
        .where.not(provider_session_id: nil).order(:updated_at, :id).limit(BATCH_SIZE).each do |order|
        Gateway.expire_session(order)
      end
    end
  end
end
