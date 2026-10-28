module Payments
  class CloseReleasedSessions
    BATCH_SIZE = 100

    def self.call
      Order.where(provider: "stripe", status: %w[canceled expired], provider_session_closed_at: nil)
        .where.not(provider_session_id: nil).order(:updated_at, :id).limit(BATCH_SIZE).each do |order|
        Gateway.expire_session(order)
        # A failed attempt moves the row to the back of the queue, so sessions
        # that keep failing cannot starve newer ones out of every batch.
        order.touch if order.reload.provider_session_closed_at.nil?
      end
    end
  end
end
