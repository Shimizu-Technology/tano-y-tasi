require "rails_helper"
require "timeout"

RSpec.describe "Admin identity concurrency" do
  self.use_transactional_tests = false

  after do
    User.where(email: "race-admin@example.com").delete_all
    AdminInvitation.where(email: "race-admin@example.com").delete_all
  end

  it "keeps provisioning denied while Clerk revocation runs outside the email lock" do
    invitation = AdminInvitation.create!(email: "race-admin@example.com", clerk_invitation_id: "inv_race")
    provider_started = Queue.new
    release_provider = Queue.new
    allow(ClerkIdentity).to receive(:profile).with("new_clerk_id").and_return(email: invitation.email, name: "Race Admin")
    allow(ClerkClient).to receive(:request).with(:post, "invitations/inv_race/revoke") do
      provider_started << true
      release_provider.pop
      { "id" => "inv_race" }
    end

    revoking = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        [ connection.object_id, AdminInvitationRevocation.call(AdminInvitation.find(invitation.id)) ]
      end
    end
    provider_started.pop
    provisioning = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        [ connection.object_id, AdminProvisioning.call("new_clerk_id") ]
      end
    end

    provisioning_connection, provisioned = Timeout.timeout(5) { provisioning.value }
    release_provider << true
    revocation_connection, = Timeout.timeout(5) { revoking.value }

    expect(provisioning_connection).not_to eq(revocation_connection)
    expect(provisioned).to be_nil
    expect(invitation.reload).to have_attributes(revoked_at: be_present, clerk_invitation_id: nil)
    expect(User.where(email: invitation.email)).not_to exist
  ensure
    release_provider << true if release_provider
    provisioning&.join
    revoking&.join
  end
end

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
