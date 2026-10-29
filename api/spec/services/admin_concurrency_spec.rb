require "rails_helper"

RSpec.describe "Admin stock concurrency" do
  self.use_transactional_tests = false
  before { @product = create(:product, stock_quantity: 1) }
  after do
    InventoryMovement.where(product: @product).delete_all
    @product.destroy!
  end

  it "locks adjustments so only one concurrent decrement can consume the last unit" do
    ready, start = Queue.new, Queue.new
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          product = Product.find(@product.id)
          ready << true
          start.pop
          begin
            Orders::Inventory.adjust!(product, -1, "Damaged box")
            :adjusted
          rescue ApiError => error
            error.code
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    expect(threads.map(&:value)).to match_array([ :adjusted, "invalid_adjustment" ])
    expect(@product.reload.stock_quantity).to eq(0)
    expect(InventoryMovement.where(product: @product, reason: "admin_adjustment").pluck(:balance)).to eq([ 0 ])
  ensure
    threads&.each(&:join)
  end
end
