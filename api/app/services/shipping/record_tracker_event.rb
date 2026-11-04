module Shipping
  # A signed tracker.updated from EasyPost. Each event id is recorded once. One that
  # matches no order is kept with no order, for the same reason Stripe's rule exists:
  # a retry can't help, and the record shows it happened.
  class RecordTrackerEvent
    def self.call(event)
      result = event["result"].is_a?(Hash) ? event["result"] : {}
      order = find_order(result)
      ShippingEvent.transaction(requires_new: true) do
        occurred_at = parse_time(result["updated_at"]) || Time.current
        ShippingEvent.create!(order: order, event_id: event.fetch("id"), event_type: event["description"], shipment_id: result["shipment_id"],
          tracking_code: result["tracking_code"], status: result["status"], occurred_at: occurred_at)
        apply(order, result["status"], occurred_at) if order
      end
      Rails.logger.warn("EASYPOST_EVENT_UNMATCHED event_id=#{event['id']}") unless order
    rescue ActiveRecord::RecordNotUnique
      nil
    end

    def self.find_order(result)
      order = Order.find_by(label_shipment_id: result["shipment_id"]) if result["shipment_id"].present?
      order || (result["tracking_code"].present? ? Order.find_by(tracking_number: result["tracking_code"], label_status: "bought") : nil)
    end

    # Events can arrive out of order, so an older one never replaces a newer status.
    def self.apply(order, status, occurred_at)
      return if status.blank?
      order.with_lock do
        next if order.tracking_status_at && order.tracking_status_at > occurred_at
        order.update!(tracking_status: status, tracking_status_at: occurred_at)
      end
    end

    def self.parse_time(value)
      value.is_a?(String) ? Time.zone.parse(value) : nil
    rescue ArgumentError
      nil
    end
    private_class_method :find_order, :apply, :parse_time
  end
end
