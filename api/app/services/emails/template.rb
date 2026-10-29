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
      prefix = { "order_confirmation" => "Your order is confirmed", "admin_new_order" => "New paid order", "order_shipped" => "Your order has shipped" }.fetch(kind)
      "Tåno + Tåsi — #{prefix} — #{order.number}"
    end

    def self.payload(delivery)
      order = delivery.order
      link = "#{frontend_url}/orders/#{order.token}"
      title = subject(delivery.kind, order)
      items = order.order_items.order(:id)
      lines = items.map { |item| "#{item.name} × #{item.quantity} — #{money(item.quantity * item.unit_price_cents)}" }
      tracking = if delivery.kind == "order_shipped"
        [ order.tracking_number.presence && "Tracking number: #{order.tracking_number}", order.tracking_url.presence ].compact
      else
        []
      end
      text = ([ "TÅNO + TÅSI", title, "Order #{order.number}" ] + lines + [ "Total: #{money(order.total_cents)}", link ] + tracking).join("\n")
      rows = lines.map { |line| "<tr><td style=\"padding:12px 0;border-bottom:1px solid #c9c2b6\">#{escape(line)}</td></tr>" }.join
      tracking_html = tracking.map { |line| "<p>#{escape(line)}</p>" }.join
      html = <<~HTML
        <!doctype html><html><body style="margin:0;background:#F5F0E7;color:#141311;font-family:Arial,sans-serif">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F0E7;color:#141311"><tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px">TÅNO + TÅSI</p>
        <h1 style="font-size:22px">#{escape(title)}</h1><p>Order #{escape(order.number)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">#{rows}</table>
        <p style="font-weight:bold">Total: #{escape(money(order.total_cents))}</p>
        <p><a style="color:#141311" href="#{escape(link)}">View your order</a></p>#{tracking_html}
        </td></tr></table></td></tr></table></body></html>
      HTML
      data = { from: ENV.fetch("MAILER_FROM_EMAIL"), to: delivery.to, subject: delivery.subject, html: html, text: text }
      data[:reply_to] = ENV["MAILER_REPLY_TO"] if ENV["MAILER_REPLY_TO"].present?
      data
    end

    def self.escape(value)
      ERB::Util.html_escape(value.to_s)
    end

    def self.money(cents)
      format("$%.2f USD", cents / 100.0)
    end
  end
end
