module Shipping
  # Buys one EasyPost label for one paid order. The lease and the saved shipment id make
  # a double click or a retry safe: one shipment can only be bought once, and an unclear
  # answer is settled by reading the shipment back. Holds no transaction or row lock
  # during a network call.
  class Label
    RETRY_MESSAGE = "EasyPost didn't answer clearly. Try again: it reads the shipment first, so it can't buy a second label.".freeze

    def self.buy(order, confirm_cents: nil)
      new(order, confirm_cents).buy
    end

    # What the admin needs to know before showing the button.
    def self.available?(order)
      EasyPostClient.configured? && order.status == "paid" && order.fulfillment_method == "ship" && order.fulfillment_status == "unfulfilled"
    end

    def initialize(order, confirm_cents)
      @order = order
      @confirm_cents = confirm_cents
      @client = EasyPostClient.new(timeouts: EasyPostClient::LABEL_TIMEOUT)
      @settings = Settings.current
    end

    def buy
      # Shared with refunds, and eligibility is checked inside it.
      ProviderLease.with("money-#{@order.id}") do
        @order.reload
        next @order if @order.label_status == "bought"
        check!
        shipment = current_shipment
        next record(shipment) if bought?(shipment)
        rate = choose_rate
        confirm!(rate)
        purchase(rate)
      end
    rescue EasyPostClient::Error => error
      Rails.logger.error("EASYPOST_LABEL_FAILED order_id=#{@order.id} status=#{error.status} code=#{error.code}")
      raise ApiError.new("shipping_unavailable", RETRY_MESSAGE, status: :service_unavailable) unless error.definitive?
      raise ApiError.new("label_rejected", "EasyPost couldn't make this label: #{error.message}")
    rescue KeyError, ArgumentError, TypeError => error
      Rails.logger.error("EASYPOST_LABEL_FAILED order_id=#{@order.id} error=#{error.class}")
      raise ApiError.new("shipping_unavailable", RETRY_MESSAGE, status: :service_unavailable)
    end

    private

    def check!
      unless self.class.available?(@order)
        raise ApiError.new("label_unavailable", "Labels can only be bought for a paid, unfulfilled order that's being shipped, once EasyPost is connected.")
      end
      raise ApiError.new("label_unavailable", "Add your full origin address in Shipping settings first.") unless @settings.origin_complete?
    end

    # The shipment made at quote time when it's still this order's to use, else a new one.
    # A quote can be used by two checkouts, and the unique index lets only one claim it.
    def current_shipment
      id = @order.label_shipment_id || claim(@order.shipping_method&.dig("provider_shipment_id"))
      return create_shipment unless id
      @client.get("shipments/#{id}")
    rescue EasyPostClient::Error => error
      raise unless error.status == 404
      create_shipment
    end

    def claim(id)
      return nil if id.blank?
      @order.update!(label_shipment_id: id)
      id
    rescue ActiveRecord::RecordNotUnique
      @order.reload
      nil
    end

    def create_shipment
      shipment = EasyPostRates.create_shipment(Address.new(saved_address), lines, @settings, client: @client)
      @order.update!(label_shipment_id: shipment.fetch("id"))
      shipment
    end

    def saved_address
      shipping = @order.shipping.to_h
      shipping.fetch("address", {}).merge(shipping.slice("name", "phone"))
    end

    def lines
      @order.order_items.includes(:product).map { |item| Parcel::Line.new(product: item.product, quantity: item.quantity, unit_price_cents: item.unit_price_cents) }
    end

    # Rates age, so always ask again and buy what's current.
    def choose_rate
      response = @client.post("shipments/#{@order.label_shipment_id}/rerate")
      rates = EasyPostRates.usable_rates(response, @settings)
      saved = @order.shipping_method.to_h
      rate = rates.find { |candidate| candidate["carrier"] == saved["carrier"] && candidate["service"] == saved["service"] } || rates.first
      raise ApiError.new("label_rejected", "EasyPost has no rate for this shipment right now.") unless rate
      rate
    end

    # A price the merchant hasn't seen needs their say-so: a re-rate that moved, or a
    # flat-rate order, where the customer's payment says nothing about the label's cost.
    def confirm!(rate)
      current = EasyPostRates.cents(rate.fetch("rate"))
      previous = @order.shipping_method&.dig("cost_cents")
      return if current == previous && rate_matches?(rate)
      return if @confirm_cents == current
      raise ApiError.new("label_price_changed", confirm_message(rate, current, previous), status: :conflict,
        details: { previous_cents: previous, current_cents: current, label: EasyPostRates.label(rate) })
    end

    def rate_matches?(rate)
      saved = @order.shipping_method.to_h
      rate["carrier"] == saved["carrier"] && rate["service"] == saved["service"]
    end

    def confirm_message(rate, current, previous)
      price = Emails::Template.money(current)
      return "The #{EasyPostRates.label(rate)} label was #{Emails::Template.money(previous)} at checkout and is #{price} now. Confirm to buy it." if previous
      "A #{EasyPostRates.label(rate)} label costs #{price}. Confirm to buy it."
    end

    def purchase(rate)
      @order.update!(label_status: "buying")
      record(@client.post("shipments/#{@order.label_shipment_id}/buy", rate: { id: rate.fetch("id") }))
    rescue EasyPostClient::Error => error
      raise unless error.definitive?
      # Bought from the dashboard or by an earlier attempt: EasyPost refuses a second purchase.
      shipment = @client.get("shipments/#{@order.label_shipment_id}")
      return record(shipment) if bought?(shipment)
      @order.update!(label_status: nil)
      raise
    end

    def bought?(shipment)
      shipment.dig("postage_label", "label_url").present?
    end

    def record(shipment)
      selected = shipment["selected_rate"].to_h
      @order.with_lock do
        @order.update!(label_status: "bought", label_url: shipment.dig("postage_label", "label_url"), label_bought_at: Time.current,
          label_cost_cents: selected["rate"] && EasyPostRates.cents(selected["rate"]), tracking_number: shipment["tracking_code"].presence || @order.tracking_number,
          tracking_url: shipment.dig("tracker", "public_url").presence || @order.tracking_url, tracking_status: shipment.dig("tracker", "status"), tracking_status_at: Time.current)
      end
      @order
    end
  end
end
