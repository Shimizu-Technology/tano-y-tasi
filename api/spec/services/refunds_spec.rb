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
    before do
      order.update!(provider: "stripe", provider_session_id: "cs_1")
      Payments::Complete.call(order, payment_intent_id: "pi_1")
    end

    it "sends a stable idempotency key and records the refund" do
      expect(Stripe::Refund).to receive(:create).with(hash_including(payment_intent: "pi_1", amount: 1000), { idempotency_key: "tano-y-tasi-refund-#{order.token}-0-1000" })
      Payments::IssueRefund.call(order, amount_cents: 1000)
      expect(order.reload).to have_attributes(status: "paid", refunded_cents: 1000)
    end

    it "keeps the order unchanged when Stripe rejects or is unavailable" do
      allow(Stripe::Refund).to receive(:create).and_raise(Stripe::InvalidRequestError.new("Already refunded", nil))
      expect { Payments::IssueRefund.call(order) }.to raise_error(ApiError) { |error| expect(error.code).to eq("refund_rejected") }
      allow(Stripe::Refund).to receive(:create).and_raise(Stripe::APIConnectionError.new("offline"))
      expect { Payments::IssueRefund.call(order) }.to raise_error(ApiError) { |error| expect(error.status).to eq(:service_unavailable) }
      expect(order.reload.refunded_cents).to eq(0)
    end
  end
end
