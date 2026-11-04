require "rails_helper"

RSpec.describe "Production run concurrency", type: :model do
  self.use_transactional_tests = false

  before do
    @product = create(:product, stock_quantity: 5)
    @run = @product.production_runs.create!(quantity: 7)
    @drops = []
    @products = [ @product ]
    @runs = [ @run ]
  end

  after do
    # Delete only this example's rows, never truncate a shared database.
    ids = @products.map(&:id)
    order_ids = OrderItem.where(product_id: ids).pluck(:order_id)
    InventoryMovement.where(product_id: ids).delete_all
    OrderItem.where(order_id: order_ids).delete_all
    EmailDelivery.where(order_id: order_ids).delete_all
    Order.where(id: order_ids).delete_all
    ProductionRun.where(id: @runs.map(&:id)).delete_all
    Product.where(id: ids).delete_all
    Drop.where(id: @drops.map(&:id)).delete_all
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

  def buy(index, product: @product)
    checkout_call(email: "race-#{index}@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 1 } ]).order
  rescue ApiError => error
    error.code
  end

  it "adds stock exactly once when twelve receives race" do
    race(12) { Orders::Inventory.receive!(ProductionRun.find(@run.id)) }
    expect(@run.reload).to have_attributes(status: "received", stock_added: 7)
    expect(@product.reload.stock_quantity).to eq(12)
    movements = InventoryMovement.where(product: @product, reason: "production_received")
    expect(movements.pluck(:delta, :balance, :production_run_id)).to eq([ [ 7, 12, @run.id ] ])
  end

  it "keeps stock and the ledger exact when a receive races twelve checkouts" do
    results = race(13) do |index|
      index.zero? ? Orders::Inventory.receive!(ProductionRun.find(@run.id)) : buy(index)
    end
    sold = results.count { |result| result.is_a?(Order) }
    # Whichever came first, the five on hand were never oversold and the seven arrived once.
    expect(sold).to be_between(5, 12)
    expect(results.count("sold_out")).to eq(12 - sold)
    expect(@product.reload.stock_quantity).to eq(5 + 7 - sold)
    movements = InventoryMovement.where(product: @product).order(:id)
    expect(movements.sum(:delta)).to eq(7 - sold)
    # Each row's balance continues from the row before it, so no update was lost.
    expect(movements.pluck(:delta, :balance).inject(5) { |balance, (delta, after)| expect(after).to eq(balance + delta); after }).to eq(@product.stock_quantity)
    expect(movements.where(reason: "production_received").count).to eq(1)
  end

  it "resolves a receive racing a cancel to one or the other, never both" do
    results = race(8) do |index|
      candidate = ProductionRun.find(@run.id)
      index.even? ? Orders::Inventory.receive!(candidate) : Orders::Inventory.cancel_run!(candidate)
    rescue ApiError => error
      error.code
    end
    expect(results.count("invalid_production_run")).to be > 0
    @run.reload
    expect(%w[received canceled]).to include(@run.status)
    expect(@product.reload.stock_quantity).to eq(@run.status == "received" ? 12 : 5)
    expect(InventoryMovement.where(production_run_id: @run.id).count).to eq(@run.status == "received" ? 1 : 0)
  end

  it "records a drop's sell-out when different products finish at once" do
    drop = create(:drop, per_customer_limit: 5, sold_out_at: nil)
    @drops << drop
    items = 8.times.map { |index| create(:product, :limited, drop: drop, position: index, stock_quantity: 1) }
    @products.concat(items)
    orders = items.each_with_index.map { |item, index| buy(index, product: item) }
    race(8) { |index| Payments::Complete.call(Order.find(orders[index].id)) }
    expect(orders.map { |order| order.reload.status }).to all(eq("paid"))
    expect(drop.reload.state).to eq("sold_out")
    expect(drop.sold_out_at).to be_present
  end

  it "doesn't deadlock when orders touching two drops refresh them in opposite orders" do
    first = create(:drop, per_customer_limit: 50)
    second = create(:drop, per_customer_limit: 50)
    @drops.push(first, second)
    a = create(:product, :limited, drop: second, stock_quantity: 50)
    b = create(:product, :limited, drop: first, stock_quantity: 50)
    @products.push(a, b)
    orders = 12.times.map do |index|
      checkout_call(email: "pair-#{index}@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: a.slug, quantity: 1 }, { product_slug: b.slug, quantity: 1 } ]).order
    end
    race(12) { |index| index.even? ? Payments::Complete.call(Order.find(orders[index].id)) : Orders::Release.call(Order.find(orders[index].id)) }
    expect(orders.map { |order| order.reload.status }.tally).to eq("paid" => 6, "canceled" => 6)
    expect(a.reload.stock_quantity).to eq(44)
    expect(b.reload.stock_quantity).to eq(44)
  end
end
