require "rails_helper"

RSpec.describe "PostgreSQL inventory concurrency", type: :model do
  self.use_transactional_tests = false

  before do
    @product = create(:product, stock_quantity: 5)
  end

  after do
    # Delete only this example's rows, never truncate a shared database.
    order_ids = OrderItem.where(product_id: @product.id).pluck(:order_id)
    InventoryMovement.where(product_id: @product.id).delete_all
    OrderItem.where(order_id: order_ids).delete_all
    Order.where(id: order_ids).delete_all
    @product.destroy!
    @drop&.reload&.destroy!
  end

  def race(count, &work)
    ready, start = Queue.new, Queue.new
    threads = count.times.map do |index|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do |connection|
          ready << connection.raw_connection.backend_pid
          start.pop
          work.call(index)
        end
      end
    end
    pids = count.times.map { ready.pop }
    expect(pids.uniq.size).to eq(count)
    count.times { start << true }
    threads.map(&:value)
  ensure
    count.times { start << true }
    threads&.each(&:join)
  end

  def buy(index, key: SecureRandom.uuid, email: "race-#{index}@example.com", quantity: 1)
    Orders::Checkout.call(email: email, idempotency_key: key, items: [ { product_slug: @product.slug, quantity: quantity } ]).order
  rescue ApiError => error
    error.code
  end

  it "sells exactly the last five units to twelve simultaneous buyers without oversell" do
    results = race(12) { |index| buy(index) }
    expect(results.count { |result| result.is_a?(Order) }).to eq(5)
    expect(results.count("sold_out")).to eq(7)
    expect(@product.reload.stock_quantity).to eq(0)
    items = OrderItem.where(product: @product)
    expect(items.sum(:quantity)).to eq(5)
    expect(items.pluck(:order_id).uniq.size).to eq(5)
    movements = InventoryMovement.where(product: @product)
    expect(movements.sum(:delta)).to eq(-5)
    expect(movements.minimum(:balance)).to eq(0)
    expect(movements.maximum(:balance)).to eq(4)
    expect(Order.where(id: items.select(:order_id)).pluck(:number).uniq.size).to eq(5)
  end

  it "returns one canonical order for twelve concurrent requests sharing a key" do
    key = SecureRandom.uuid
    results = race(12) { |index| buy(index, key: key, email: "same@example.com") }
    expect(results.map(&:id).uniq.size).to eq(1)
    expect(@product.reload.stock_quantity).to eq(4)
    expect(InventoryMovement.where(product: @product).count).to eq(1)
  end

  it "enforces the per-customer limit across concurrent different checkout keys" do
    @drop = create(:drop, per_customer_limit: 2)
    @product.update!(kind: "drop", drop: @drop)
    results = race(12) { |index| buy(index, email: "same@example.com") }
    expect(results.count { |result| result.is_a?(Order) }).to eq(2)
    expect(results.count("limit_exceeded")).to eq(10)
    expect(@product.reload.stock_quantity).to eq(3)
  end

  it "releases a hold once when cancellation races across connections" do
    order = buy(1)
    race(12) { Orders::Release.call(Order.find(order.id)) }
    expect(@product.reload.stock_quantity).to eq(5)
    expect(InventoryMovement.where(order: order, reason: "release").count).to eq(1)
  end
  it "keeps cancellation racing with completion consistent" do
    order = buy(1)
    race(12) do |index|
      candidate = Order.find(order.id)
      index.even? ? Payments::Complete.call(candidate) : Orders::Release.call(candidate)
    end
    expect(order.reload.status).to eq("paid")
    expect(@product.reload.stock_quantity).to eq(4)
    expect(InventoryMovement.where(order: order).sum(:delta)).to eq(-1)
  end

  it "does not hold a transaction or inventory locks while creating a payment session" do
    allow(Payments::Gateway).to receive(:create_session) do |order|
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      Thread.new do
        Product.connection_pool.with_connection do
          Product.transaction do
            Product.lock("FOR UPDATE NOWAIT").find(@product.id)
          end
        end
      end.value
      { id: "sim_#{order.token}", url: "http://localhost:5181/checkout/simulated/#{order.token}", expires_at: order.expires_at }
    end
    expect(buy(1)).to be_a(Order)
  end

  it "does not hold inventory locks while closing a released Stripe session" do
    order = buy(1)
    order.update!(provider: "stripe", provider_session_id: "cs_unlocked")
    Orders::Release.call(order)
    allow(Stripe::Checkout::Session).to receive(:expire) do
      expect(ActiveRecord::Base.connection.transaction_open?).to be(false)
      Thread.new do
        Product.connection_pool.with_connection do
          Product.transaction { Product.lock("FOR UPDATE NOWAIT").find(@product.id) }
        end
      end.value
      Stripe::StripeObject.construct_from(status: "expired")
    end
    Payments::Gateway.expire_session(order)
    expect(order.reload.provider_session_closed_at).to be_present
  end

  it "serializes late payments against a replacement checkout for the same customer" do
    @drop = create(:drop, per_customer_limit: 2)
    @product.update!(kind: "drop", drop: @drop)
    old = buy(1, email: "same@example.com", quantity: 2)
    Orders::Release.call(old, status: "expired")
    replacement = buy(2, email: "same@example.com", quantity: 2)
    race(12) do |index|
      candidate = Order.find(index.even? ? old.id : replacement.id)
      Payments::Complete.call(candidate)
    end
    expect(old.reload.status).to eq("needs_attention")
    expect(%w[paid needs_attention]).to include(replacement.reload.status)
    expect(@product.reload.stock_quantity).to eq(replacement.status == "paid" ? 3 : 5)
    expect(OrderItem.joins(:order).where(product: @product, orders: { status: "paid" }).sum(:quantity)).to be <= 2
    expect(InventoryMovement.where(order: replacement, reason: "release").count).to eq(replacement.status == "paid" ? 0 : 1)
    expect(InventoryMovement.where(order: old, reason: "late_payment_reserve").count).to eq(0)
  end
end
