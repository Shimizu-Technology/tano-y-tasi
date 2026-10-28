require "rails_helper"
require "rake"

RSpec.describe "Released Stripe session closure", type: :request do
  let(:product) { create(:product, stock_quantity: 5) }
  let(:order) do
    Orders::Checkout.call(email: "buyer@example.com", idempotency_key: SecureRandom.uuid,
      items: [ { product_slug: product.slug, quantity: 2 } ]).order.tap do |row|
      row.update!(provider: "stripe", provider_session_id: "cs_close")
    end
  end
  let(:expired_session) { Stripe::StripeObject.construct_from(status: "expired") }

  def cancel
    post "/api/v1/orders/#{order.token}/cancel"
    expect(response).to have_http_status(:ok)
  end

  def run_expiry_task
    Rails.application.load_tasks unless Rake::Task.task_defined?("orders:release_expired")
    task = Rake::Task["orders:release_expired"]
    task.reenable
    task.invoke
  end

  it "retries a failed expiration on a second cancel without restoring stock twice" do
    attempts = 0
    allow(Stripe::Checkout::Session).to receive(:expire).with("cs_close") do
      attempts += 1
      raise Stripe::APIConnectionError, "offline" if attempts == 1
      expired_session
    end
    cancel
    expect(order.reload.status).to eq("canceled")
    expect(order.provider_session_closed_at).to be_nil
    expect(product.reload.stock_quantity).to eq(5)
    cancel
    closed_at = order.reload.provider_session_closed_at
    expect(closed_at).to be_present
    cancel
    expect(attempts).to eq(2)
    expect(order.reload.provider_session_closed_at).to eq(closed_at)
    expect(InventoryMovement.where(order: order, reason: "release").count).to eq(1)
  end

  it "also retries cancel for an expired order" do
    Orders::Release.call(order, status: "expired")
    expect(Stripe::Checkout::Session).to receive(:expire).with("cs_close").and_return(expired_session)
    cancel
    expect(response.parsed_body.dig("order", "status")).to eq("expired")
    expect(order.reload.provider_session_closed_at).to be_present
    expect(product.reload.stock_quantity).to eq(5)
  end

  %w[expired complete].each do |status|
    it "confirms already #{status} sessions are closed after Stripe rejects expiration" do
      allow(Stripe::Checkout::Session).to receive(:expire).and_raise(Stripe::InvalidRequestError.new("not open", nil))
      expect(Stripe::Checkout::Session).to receive(:retrieve).with("cs_close")
        .and_return(Stripe::StripeObject.construct_from(status: status))
      cancel
      expect(order.reload.provider_session_closed_at).to be_present
    end
  end

  it "keeps the retry marker when an invalid request does not prove closure" do
    allow(Stripe::Checkout::Session).to receive(:expire).and_raise(Stripe::InvalidRequestError.new("invalid", nil))
    allow(Stripe::Checkout::Session).to receive(:retrieve).and_return(Stripe::StripeObject.construct_from(status: "open"))
    cancel
    expect(order.reload.provider_session_closed_at).to be_nil
  end

  it "retries unclosed released sessions through the scheduled rake task" do
    allow(Stripe::Checkout::Session).to receive(:expire).and_raise(Stripe::APIConnectionError.new("offline"))
    cancel
    expect(order.reload.provider_session_closed_at).to be_nil
    allow(Stripe::Checkout::Session).to receive(:expire).and_return(expired_session)
    run_expiry_task
    expect(order.reload.provider_session_closed_at).to be_present
    expect(product.reload.stock_quantity).to eq(5)
    expect(Stripe::Checkout::Session).to have_received(:expire).with("cs_close").twice
  end

  it "closes newly expired Stripe holds in the same scheduled task run" do
    order.update!(expires_at: 6.minutes.ago)
    expect(Stripe::Checkout::Session).to receive(:expire).with("cs_close").and_return(expired_session)
    run_expiry_task
    expect(order.reload.status).to eq("expired")
    expect(order.provider_session_closed_at).to be_present
    expect(product.reload.stock_quantity).to eq(5)
    expect(InventoryMovement.where(order: order, reason: "release").count).to eq(1)
  end

  it "bounds closure retry work independently of the expiry release batch" do
    rows = 101.times.map do |index|
      row = Orders::Checkout.call(email: "batch@example.com", idempotency_key: SecureRandom.uuid,
        items: [ { product_slug: product.slug, quantity: 1 } ]).order
      Orders::Release.call(row)
      row.update!(provider: "stripe", provider_session_id: "cs_batch_#{index}")
      row
    end
    allow(Stripe::Checkout::Session).to receive(:expire).and_return(expired_session)
    Payments::CloseReleasedSessions.call
    expect(Order.where(id: rows.map(&:id)).where.not(provider_session_closed_at: nil).count).to eq(100)
    expect(Stripe::Checkout::Session).to have_received(:expire).exactly(100).times
    Payments::CloseReleasedSessions.call
    expect(Order.where(id: rows.map(&:id), provider_session_closed_at: nil)).not_to exist
    expect(Stripe::Checkout::Session).to have_received(:expire).exactly(101).times
    expect(product.reload.stock_quantity).to eq(5)
  end
end
