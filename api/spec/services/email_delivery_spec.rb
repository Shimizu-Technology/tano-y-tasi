require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Transactional email delivery", type: :request do
  self.use_transactional_tests = false
  include_context "admin auth"

  before do
    @event_ids = []
    @orders = []
    @product_ids = []
    @user_ids = []
    ENV["EMAIL_DELIVERY_ENABLED"] = "true"
    @order = owned_order
    allow(Resend::Emails).to receive(:send).and_return({ "id" => "email_test" })
  end

  after do
    PaymentEvent.where(event_id: @event_ids).delete_all
    InventoryMovement.where(order_id: @orders.map(&:id)).delete_all
    OrderItem.where(order_id: @orders.map(&:id)).delete_all
    Order.where(id: @orders.map(&:id)).delete_all
    Product.where(id: @product_ids).delete_all
    User.where(id: @user_ids).delete_all
  end

  def owned_order
    order = make_order(status: "pending_payment")
    @orders << order
    @product_ids.concat(order.order_items.pluck(:product_id))
    order
  end

  def complete
    event_id = SecureRandom.uuid
    @event_ids << event_id
    Payments::ProcessEvent.call(provider: "simulated", event_id: event_id, event_type: "checkout.session.completed", order: @order)
  end

  def confirmation
    @order.email_deliveries.find_by!(kind: "order_confirmation")
  end

  it "sends only after the outer payment commit with no open transaction or product locks" do
    allow(Resend::Emails).to receive(:send) do |payload, options:|
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      expect(@order.reload.status).to eq("paid")
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          Product.transaction { Product.lock("FOR UPDATE NOWAIT").find(@product_ids.first) }
        end
      end.value
      expect(options[:idempotency_key]).to eq("order_confirmation-#{@order.token}")
      expect(payload).to include("from" => ENV["MAILER_FROM_EMAIL"], "to" => @order.email)
      { id: "email_committed" }
    end
    Order.transaction do
      complete
      expect(Resend::Emails).not_to have_received(:send)
    end
    expect(confirmation).to have_attributes(status: "sent", attempts: 1, provider_message_id: "email_committed")
  end

  it "does not deliver or keep records when the payment transaction rolls back" do
    Order.transaction do
      complete
      raise ActiveRecord::Rollback
    end
    expect(@order.reload.status).to eq("pending_payment")
    expect(@order.email_deliveries).to be_empty
    expect(Resend::Emails).not_to have_received(:send)
  end

  it "records failed sends without failing payment and retries the same payload and key" do
    allow(Resend::Emails).to receive(:send).and_raise(Timeout::Error)
    expect { complete }.not_to raise_error
    row = confirmation
    expect(row).to have_attributes(status: "failed", attempts: 1)
    expect(row.last_error).to include("Timeout::Error")
    expect(@order.reload.status).to eq("paid")
    payload, key = row.outbound_payload, row.idempotency_key
    @order.update!(notes: "A later edit")
    allow(Resend::Emails).to receive(:send).with(payload, options: { idempotency_key: key }).and_return(id: "retry_sent")
    row.deliver!
    expect(row.reload).to have_attributes(status: "sent", attempts: 2, provider_message_id: "retry_sent", last_error: nil)
    expect(row.idempotency_key).to eq(key)
  end

  it "records skipped delivery when the explicit boolean is false" do
    ENV["EMAIL_DELIVERY_ENABLED"] = "false"
    complete
    expect(confirmation).to have_attributes(status: "skipped", attempts: 0)
    expect(Resend::Emails).not_to have_received(:send)
  end

  it "does not duplicate email on repeated completion or delivery" do
    2.times { complete }
    2.times { confirmation.deliver! }
    expect(@order.email_deliveries.count).to eq(1)
    expect(Resend::Emails).to have_received(:send).once
  end

  it "uses a new persistent key when an admin resends via the scoped endpoint" do
    complete
    original = confirmation.idempotency_key
    @user_ids << admin.id
    post "/api/v1/admin/orders/#{@order.number}/email_deliveries/#{confirmation.id}/resend", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body.dig("email_delivery", "status")).to eq("sent")
    expect(confirmation.idempotency_key).to eq("#{original}-resend-2")
    expect(confirmation.attempts).to eq(2)
    expect(Resend::Emails).to have_received(:send).twice
  end

  it "sends to each active admin with distinct keys and honors the override" do
    users = 2.times.map { |n| User.create!(clerk_id: "email-admin-#{SecureRandom.uuid}", email: "notice#{n}@example.com") }
    @user_ids.concat(users.map(&:id))
    complete
    notices = @order.email_deliveries.where(kind: "admin_new_order")
    expect(notices.pluck(:to)).to match_array(users.map(&:email))
    expect(notices.map(&:idempotency_key).uniq.size).to eq(2)
    ENV["ADMIN_NOTIFICATION_EMAILS"] = "ops@example.com, ops@example.com"
    @order = owned_order
    complete
    expect(@order.email_deliveries.where(kind: "admin_new_order").pluck(:to)).to eq([ "ops@example.com" ])
  end

  it "sends shipped email once after fulfill and includes escaped tracking" do
    complete
    @user_ids << admin.id
    allow(Resend::Emails).to receive(:send) do |payload, options:|
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      expect(payload["text"]).to include("TRACK123", "https://track.example.com/123")
      expect(options[:idempotency_key]).to eq("order_shipped-#{@order.token}")
      { id: "shipped" }
    end
    2.times do
      post "/api/v1/admin/orders/#{@order.number}/fulfill", params: { tracking_number: "TRACK123", tracking_url: "https://track.example.com/123", notify: true }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
    end
    expect(@order.email_deliveries.find_by!(kind: "order_shipped")).to have_attributes(status: "sent", attempts: 1)
  end

  it "does not send shipped mail when notify is false" do
    complete
    @user_ids << admin.id
    post "/api/v1/admin/orders/#{@order.number}/fulfill", params: { notify: false }, headers: headers, as: :json
    expect(@order.email_deliveries.where(kind: "order_shipped")).not_to exist
  end

  it "escapes user content in HTML and provides branded plain text and order links" do
    @order.order_items.first.update!(name: '<script>alert("x")</script>')
    ENV["MAILER_REPLY_TO"] = "hello@example.com"
    complete
    payload = confirmation.outbound_payload
    expect(payload["html"]).to include("TÅNO + TÅSI", "#F5F0E7", "#141311", "&lt;script&gt;")
    expect(payload["html"]).not_to include("<script>")
    expect(payload["text"]).to include(@order.number, "$35.00 USD", "http://localhost:5181/orders/#{@order.token}")
    expect(payload["reply_to"]).to eq("hello@example.com")
  end

  it "caps automatic retries at five attempts and lets the task recover pending work" do
    allow(Resend::Emails).to receive(:send).and_raise(Timeout::Error)
    complete
    8.times { confirmation.deliver! }
    expect(confirmation).to have_attributes(attempts: 5, status: "failed")
    row = EmailDelivery.create!(order: @order, kind: "order_shipped", to: @order.email, subject: "Shipped")
    require "rake"
    Rails.application.load_tasks unless Rake::Task.task_defined?("emails:retry_failed")
    allow(Resend::Emails).to receive(:send).and_return(id: "recovered")
    Rake::Task["emails:retry_failed"].reenable
    Rake::Task["emails:retry_failed"].invoke
    expect(row.reload.status).to eq("sent")
    expect(confirmation.attempts).to eq(5)
  end

  it "records configuration or missing-provider-ID failures" do
    ENV.delete("MAILER_FROM_EMAIL")
    complete
    expect(confirmation.status).to eq("failed")
    ENV["MAILER_FROM_EMAIL"] = "orders@example.com"
    allow(Resend::Emails).to receive(:send).and_return({})
    confirmation.deliver!
    expect(confirmation.status).to eq("failed")
  end

  it "defers a direct deliver! call inside a transaction until commit" do
    row = EmailDelivery.create!(order: @order, kind: "order_confirmation", to: @order.email, subject: "Confirmation")
    Order.transaction do
      row.deliver!
      expect(Resend::Emails).not_to have_received(:send)
    end
    expect(row.reload.status).to eq("sent")
  end
end
