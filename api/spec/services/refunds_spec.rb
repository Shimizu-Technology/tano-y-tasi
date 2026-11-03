require "rails_helper"

RSpec.describe "Issuing refunds" do
  let(:product) { create(:product, stock_quantity: 5) }
  let(:order) do
    Orders::Checkout.call(email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 2 } ]).order
  end

  context "with the simulated provider" do
    before { Payments::Complete.call(order) }

    it "refunds the remaining balance by default and restocks" do
      Payments::IssueRefund.call(order)
      expect(order.reload).to have_attributes(status: "refunded", refunded_cents: 7000)
      expect(product.reload.stock_quantity).to eq(5)
    end

    it "rejects amounts over the remaining balance" do
      Payments::IssueRefund.call(order, amount_cents: 6000)
      expect { Payments::IssueRefund.call(order, amount_cents: 1001) }.to raise_error(ApiError) { |error| expect(error.code).to eq("invalid_refund") }
      expect(order.reload.refunded_cents).to eq(6000)
    end

    it "rejects a second refund once fully refunded" do
      Payments::IssueRefund.call(order)
      expect { Payments::IssueRefund.call(order) }.to raise_error(ApiError)
    end
  end

  it "refuses an order that was never paid" do
    expect { Payments::IssueRefund.call(order) }.to raise_error(ApiError) { |error| expect(error.code).to eq("invalid_refund") }
  end

  context "with Stripe" do
    let(:refunds) { [] }
    let(:list) { ->(*) { Stripe::ListObject.construct_from(object: "list", data: refunds.dup, has_more: false) } }
    before do
      order.update!(provider: "stripe", provider_session_id: "cs_1")
      Payments::Complete.call(order, payment_intent_id: "pi_1")
      allow(Stripe::Refund).to receive(:list, &list)
      allow(Stripe::Dispute).to receive(:list).and_return(Stripe::ListObject.construct_from(object: "list", data: [], has_more: false))
    end

    def stripe_accepts(amount)
      lambda do |params, _options|
        refund = { id: "re_#{refunds.size}", object: "refund", amount: amount, status: "succeeded", metadata: params[:metadata].transform_values(&:to_s) }
        refunds << refund
        Stripe::Refund.construct_from(refund)
      end
    end

    it "records the refund Stripe reports" do
      expect(Stripe::Refund).to receive(:create, &stripe_accepts(1000))
      Payments::IssueRefund.call(order, amount_cents: 1000)
      expect(order.reload).to have_attributes(status: "paid", refunded_cents: 1000)
      expect(order.refund_requests.last).to have_attributes(status: "completed", provider_refund_id: "re_0")
    end

    it "reuses the same key when an uncertain request is retried, even after a webhook recorded it" do
      keys = []
      allow(Stripe::Refund).to receive(:create) do |_params, options|
        keys << options[:idempotency_key]
        raise Stripe::APIConnectionError.new("timed out")
      end
      expect { Payments::IssueRefund.call(order, amount_cents: 1000) }.to raise_error(ApiError) { |error| expect(error.status).to eq(:service_unavailable) }
      order.update!(refunded_cents: 1000)
      expect { Payments::IssueRefund.call(order, amount_cents: 1000) }.to raise_error(ApiError)
      expect(keys.uniq.size).to eq(1)
      expect(order.refund_requests.count).to eq(1)
    end

    it "finds an earlier attempt at Stripe instead of creating a second refund" do
      request = order.refund_requests.create!(amount_cents: 1000)
      refunds << { id: "re_earlier", object: "refund", amount: 1000, status: "succeeded", metadata: { refund_request_id: request.id.to_s } }
      expect(Stripe::Refund).not_to receive(:create)
      Payments::IssueRefund.call(order, amount_cents: 1000)
      expect(request.reload).to have_attributes(status: "completed", provider_refund_id: "re_earlier")
      expect(order.reload.refunded_cents).to eq(1000)
    end

    it "blocks a different amount while a refund is unconfirmed" do
      order.refund_requests.create!(amount_cents: 1000)
      expect(Stripe::Refund).not_to receive(:create)
      expect { Payments::IssueRefund.call(order, amount_cents: 500) }.to raise_error(ApiError) { |error| expect(error.code).to eq("refund_in_progress") }
    end

    it "keeps the order unchanged and frees the request when Stripe rejects it" do
      allow(Stripe::Refund).to receive(:create).and_raise(Stripe::InvalidRequestError.new("Already refunded", nil))
      expect { Payments::IssueRefund.call(order) }.to raise_error(ApiError) { |error| expect(error.code).to eq("refund_rejected") }
      expect(order.reload.refunded_cents).to eq(0)
      expect(order.refund_requests.open).not_to exist
    end

    it "keeps the request open until the order reflects the refund, so a retry can't pay twice" do
      allow(Stripe::Refund).to receive(:create, &stripe_accepts(1000))
      calls = 0
      allow(Stripe::Refund).to receive(:list) do
        calls += 1
        raise Stripe::APIConnectionError.new("offline") if calls == 2
        list.call
      end
      expect { Payments::IssueRefund.call(order, amount_cents: 1000) }.to raise_error(ApiError) { |error| expect(error.status).to eq(:service_unavailable) }
      expect(order.refund_requests.last.status).to eq("open")
      expect(Stripe::Refund).to have_received(:create).once
      Payments::IssueRefund.call(order, amount_cents: 1000)
      expect(Stripe::Refund).to have_received(:create).once
      expect(order.reload.refunded_cents).to eq(1000)
      expect(order.refund_requests.last.status).to eq("completed")
    end

    it "repeats nothing when a retry follows a webhook that already closed the request" do
      allow(Stripe::Refund).to receive(:create, &stripe_accepts(1000))
      calls = 0
      allow(Stripe::Refund).to receive(:list) do
        calls += 1
        raise Stripe::APIConnectionError.new("offline") if calls == 2
        list.call
      end
      expect { Payments::IssueRefund.call(order, amount_cents: 1000, key: "attempt-1") }.to raise_error(ApiError)
      Payments::SyncProviderState.call(order)
      expect(order.refund_requests.last.status).to eq("completed")
      Payments::IssueRefund.call(order, amount_cents: 1000, key: "attempt-1")
      expect(Stripe::Refund).to have_received(:create).once
      expect(order.reload.refunded_cents).to eq(1000)
    end

    it "closes a request the webhook reconciled, and lets a retry finish on a refunded order" do
      request = order.refund_requests.create!(amount_cents: 7000)
      refunds << { id: "re_lost", object: "refund", amount: 7000, status: "succeeded", metadata: { refund_request_id: request.id.to_s } }
      Payments::SyncProviderState.call(order)
      expect(request.reload).to have_attributes(status: "completed", provider_refund_id: "re_lost")
      expect(order.reload.status).to eq("refunded")

      stranded = order.refund_requests.create!(amount_cents: 1)
      refunds.first[:metadata][:refund_request_id] = stranded.id.to_s
      expect(Stripe::Refund).not_to receive(:create)
      Payments::IssueRefund.call(order)
      expect(stranded.reload.status).to eq("completed")
    end

    it "alerts once about a refund that failed before it was ever counted" do
      User.create!(clerk_id: "admin", email: "admin@example.com")
      refunds << { id: "re_failed", object: "refund", amount: 1000, status: "failed" }
      2.times { Payments::SyncProviderState.call(order) }
      expect(order.reload).to have_attributes(status: "paid", attention_reason: "refund_failed", refunded_cents: 0, failed_refund_ids: [ "re_failed" ])
      alert = order.email_deliveries.find_by!(kind: "admin_attention")
      expect(alert.resend_number).to eq(0)

      refunds << { id: "re_failed_2", object: "refund", amount: 500, status: "canceled" }
      Payments::SyncProviderState.call(order)
      expect(alert.reload).to have_attributes(status: "pending", resend_number: 1, attempts: 0)
    end

    it "serializes state reads, so a stale read can't overwrite a newer one" do
      ProviderLease.create!(key: "payment-state-#{order.id}", holder: "other", expires_at: 1.minute.from_now)
      stub_const("ProviderLease::WAIT", 0.seconds)
      expect(Stripe::Refund).not_to receive(:list)
      expect { Payments::SyncProviderState.call(order) }.to raise_error(ProviderLease::Busy)
    end

    it "refunds what a mismatched payment actually charged" do
      order.update!(status: "needs_attention", charged_cents: 1000, attention_reason: "amount_mismatch")
      allow(Stripe::Refund).to receive(:create, &stripe_accepts(1000))
      Payments::IssueRefund.call(order)
      expect(order.reload).to have_attributes(status: "refunded", refunded_cents: 1000)
    end
  end
end
