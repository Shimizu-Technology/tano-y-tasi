module Emails
  module Template
    def self.frontend_url
      value = ENV["FRONTEND_URL"].presence || Rails.application.config.x.web_origins.first
      uri = URI.parse(value)
      unless %w[http https].include?(uri.scheme) && uri.host && !uri.userinfo && !uri.query && !uri.fragment && [ "", "/" ].include?(uri.path) && (!Rails.env.production? || uri.scheme == "https")
        raise "FRONTEND_URL must be a valid frontend origin"
      end
      value.delete_suffix("/")
    end

    def self.subject(kind, order)
      prefix = { "order_confirmation" => "Your order is confirmed", "admin_new_order" => "New paid order", "admin_attention" => "Order needs attention", "order_shipped" => "Your order has shipped", "order_refunded" => "Your refund has been issued" }.fetch(kind)
      prefix = "Your order is ready for pickup" if kind == "order_shipped" && order.fulfillment_method == "pickup"
      "Tåno + Tåsi — #{prefix} — #{order.number}"
    end

    def self.payload(delivery)
      order = delivery.order
      admin = delivery.kind.start_with?("admin_")
      link = admin ? "#{frontend_url}/admin/orders/#{order.number}" : "#{frontend_url}/orders/#{order.token}"
      title = subject(delivery.kind, order)
      items = order.order_items.order(:id)
      # Once it has shipped, the promised date is history.
      lines = items.map do |item|
        line = "#{item.name} × #{item.quantity} — #{money(item.quantity * item.unit_price_cents)}"
        item.preorder_ships.present? && delivery.kind != "order_shipped" ? "#{line} — Preorder. #{item.preorder_ships}" : line
      end
      tracking = if delivery.kind == "order_shipped"
        [ order.tracking_number.presence && "Tracking number: #{order.tracking_number}", order.tracking_url.presence ].compact
      else
        []
      end
      reply_to = ENV["MAILER_REPLY_TO"].presence || "support@shimizu-technology.com"
      notes = extra_lines(delivery.kind, order)
      totals = total_lines(order)
      destination = destination_lines(delivery.kind, order)
      text = ([ "TÅNO + TÅSI", title, "Order #{order.number}" ] + notes + lines + totals + destination + [ link ] + tracking).join("\n")
      rows = lines.map { |line| "<tr><td style=\"padding:12px 0;border-bottom:1px solid #c9c2b6\">#{escape(line)}</td></tr>" }.join
      tracking_html = tracking.map { |line| "<p>#{escape(line)}</p>" }.join
      html = <<~HTML
        <!doctype html><html><body style="margin:0;background:#F5F0E7;color:#141311;font-family:Arial,sans-serif">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F0E7;color:#141311"><tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px">TÅNO + TÅSI</p>
        <h1 style="font-size:22px">#{escape(title)}</h1><p>Order #{escape(order.number)}</p>#{notes.map { |line| "<p>#{escape(line)}</p>" }.join}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">#{rows}</table>
        #{totals.map.with_index { |line, index| "<p style=\"#{index == totals.size - 1 ? 'font-weight:bold' : 'margin:4px 0'}\">#{escape(line)}</p>" }.join}
        #{destination.map { |line| "<p style=\"margin:4px 0\">#{escape(line)}</p>" }.join}
        <p><a style="color:#141311" href="#{escape(link)}">#{admin ? "Open in admin" : "View your order"}</a></p>#{tracking_html}
        <p style="font-size:14px">Questions? Just reply, or email #{escape(reply_to)}.</p>
        </td></tr></table></td></tr></table></body></html>
      HTML
      { from: ENV.fetch("MAILER_FROM_EMAIL"), to: delivery.to, subject: delivery.subject, html: html, text: text, reply_to: reply_to }
    end

    # An order with no shipping or tax reads as it always has: one total.
    def self.total_lines(order)
      lines = []
      if order.shipping_cents.positive? || order.tax_cents.positive? || order.shipping_method
        lines << "Subtotal: #{money(order.subtotal_cents)}"
        label = order.shipping_method&.dig("label")
        lines << "#{label ? "Shipping (#{label})" : 'Shipping'}: #{money(order.shipping_cents)}"
        lines << "Tax: #{money(order.tax_cents)}" if order.tax_cents.positive?
      end
      lines << "Total: #{money(order.grand_total_cents)}"
    end

    def self.destination_lines(kind, order)
      return [] unless %w[order_confirmation admin_new_order order_shipped].include?(kind)
      if order.fulfillment_method == "pickup"
        return [ "Pick up in Guam: #{order.shipping_method&.dig('instructions')}".strip ]
      end
      saved = order.shipping.to_h
      address = saved["address"].to_h
      locality = [ address["city"], address["state"] ].compact_blank.join(", ")
      lines = [ saved["name"], address["line1"], address["line2"], [ locality, address["postal_code"] ].compact_blank.join(" ") ].compact_blank
      lines.empty? ? [] : [ "Shipping to:" ] + lines
    end

    ATTENTION_REASONS = {
      "amount_mismatch" => "Stripe charged an amount that doesn't match this order.",
      "session_mismatch" => "This payment came from a different Stripe checkout session than the order expected.",
      "store_closed" => "This payment arrived after the store was closed.",
      "drop_withdrawn" => "This payment arrived after the drop was moved back to Coming soon.",
      "drop_closed" => "This late payment arrived after the drop had closed.",
      "customer_limit_exceeded" => "This payment would put the customer over the product's per-customer limit.",
      "stock_unavailable" => "This late payment arrived after the stock was gone.",
      "refund_failed" => "A refund on this order failed at Stripe, so the customer still hasn't been paid back."
    }.freeze

    def self.extra_lines(kind, order)
      case kind
      when "order_refunded"
        [ "We refunded #{money(order.refunded_cents)} to your original payment method. It can take 5 to 10 business days to appear." ]
      when "admin_attention"
        [ ATTENTION_REASONS[order.attention_reason], order.dispute_status && "Payment dispute status: #{order.dispute_status.tr('_', ' ')}.", "Review this order and refund it or mark it paid." ].compact
      else
        []
      end
    end

    def self.escape(value)
      ERB::Util.html_escape(value.to_s)
    end

    def self.money(cents)
      format("$%.2f USD", cents / 100.0)
    end
  end
end
