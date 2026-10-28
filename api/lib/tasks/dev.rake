namespace :dev do
  desc "Set seeded drop state: upcoming, live, sold_out, closed (development only)"
  task :drop_state, [ :state ] => :environment do |_task, args|
    abort "Development only" unless Rails.env.development?
    state = args[:state]
    abort "Use upcoming, live, sold_out, or closed" unless %w[upcoming live sold_out closed].include?(state)
    drop = Drop.find_by!(slug: "drop-001-guahan-sunset-map")
    product = drop.product
    Product.transaction do
      product.lock!
      abort "Cancel or expire pending drop orders first" if OrderItem.joins(:order).where(product: product, orders: { status: "pending_payment" }).exists?
      drop.update!(release_at: state == "upcoming" ? 1.day.from_now : 1.day.ago,
        closes_at: state == "closed" ? 1.hour.ago : nil, sold_out_at: state == "sold_out" ? Time.current : nil)
      product.update!(stock_quantity: state == "sold_out" ? 0 : drop.quantity)
    end
    puts "Drop 001: #{drop.reload.state}"
  end
end
