require "rails_helper"
require "timeout"

RSpec.describe ProviderLease do
  it "releases after the block, even when it raises" do
    expect { described_class.with("k") { raise "boom" } }.to raise_error("boom")
    expect(described_class.where(key: "k")).not_to exist
    expect(described_class.with("k") { :ran }).to eq(:ran)
  end

  it "refuses a held key, and takes it over once the holder's lease has expired" do
    described_class.create!(key: "k", holder: "crashed", expires_at: 1.minute.from_now)
    expect { described_class.with("k", wait: 0) { :ran } }.to raise_error(described_class::Busy)
    described_class.where(key: "k").update_all(expires_at: 1.minute.ago)
    expect(described_class.with("k", wait: 0) { :ran }).to eq(:ran)
  end

  it "does not release a lease another holder took over" do
    described_class.with("k") do
      described_class.where(key: "k").update_all(holder: "other")
    end
    expect(described_class.find("k").holder).to eq("other")
  end

  context "across connections" do
    self.use_transactional_tests = false
    after { described_class.delete_all }

    it "serializes concurrent holders without a session lock" do
      active = Concurrent::AtomicFixnum.new
      peak = Concurrent::AtomicFixnum.new
      threads = 6.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            described_class.with("shared") do
              peak.update { |value| [ value, active.increment ].max }
              sleep 0.02
              active.decrement
            end
          end
        end
      end
      Timeout.timeout(15) { threads.each(&:join) }
      expect(peak.value).to eq(1)
    end
  end
end
