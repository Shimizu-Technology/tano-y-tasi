namespace :maintenance do
  desc "Hourly upkeep: expired holds, unclosed Stripe sessions, late refund events, failed emails, stale leases"
  task run: :environment do
    Orders::ReleaseExpired.call
    Payments::CloseReleasedSessions.call
    Order.where(provider_payment_intent_id: PaymentEvent.unresolved.select(:payment_intent_id)).find_each do |order|
      Payments::SyncProviderState.resolve_events(order)
    rescue *Payments::SyncProviderState::RETRYABLE => error
      Rails.logger.warn("MAINTENANCE_SYNC_FAILED order_id=#{order.id} error=#{error.class}")
    end
    EmailDelivery.retryable.find_each(&:deliver!)
    ProviderLease.purge_expired
  end
end
