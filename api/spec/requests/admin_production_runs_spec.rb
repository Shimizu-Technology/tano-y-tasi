require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Admin production runs", type: :request do
  include_context "admin auth"

  let!(:product) { create(:product, stock_quantity: 10) }
  let(:runs) { "/api/v1/admin/products/#{product.slug}/production_runs" }
  let(:valid) { { quantity: 500, supplier: "  Shenzhen Puzzle Co  ", unit_cost_cents: 720, expected_at: "2027-01-15", notes: "Deposit paid" } }

  def error
    response.parsed_body["error"]
  end

  def add_run(attributes = valid)
    post runs, params: attributes, headers: headers, as: :json
    response.parsed_body["production_run"]
  end

  it "requires an admin" do
    post runs, params: valid, as: :json
    expect(response).to have_http_status(:unauthorized)
    get runs
    expect(response).to have_http_status(:unauthorized)
  end

  it "adds and lists runs, newest first, and leaves stock alone until received" do
    run = add_run
    expect(response).to have_http_status(:created)
    expect(run).to include("quantity" => 500, "status" => "ordered", "supplier" => "Shenzhen Puzzle Co", "unit_cost_cents" => 720, "expected_at" => "2027-01-15", "notes" => "Deposit paid", "received_at" => nil, "stock_added" => nil)
    newer = add_run(quantity: 100)
    get runs, headers: headers
    expect(response.parsed_body["production_runs"].map { |item| item["id"] }).to eq([ newer["id"], run["id"] ])
    expect(product.reload.stock_quantity).to eq(10)
    expect(InventoryMovement.where(product: product)).to be_empty
  end

  it "ignores fields the merchant can't set directly" do
    run = add_run(valid.merge(status: "received", received_at: Time.current.iso8601, stock_added: 500))
    expect(run).to include("status" => "ordered", "received_at" => nil, "stock_added" => nil)
    patch "#{runs}/#{run['id']}", params: { status: "received", stock_added: 5, quantity: 400, product_id: create(:product).id }, headers: headers, as: :json
    expect(response.parsed_body["production_run"]).to include("status" => "ordered", "stock_added" => nil, "quantity" => 400)
    expect(ProductionRun.find(run["id"]).product).to eq(product)
    expect(product.reload.stock_quantity).to eq(10)
  end

  it "reports field errors" do
    add_run(quantity: 0, unit_cost_cents: -1, expected_at: "not a date", supplier: "x" * 201)
    expect(response).to have_http_status(:unprocessable_content)
    expect(error["code"]).to eq("invalid_record")
    expect(error["details"].keys).to include("quantity", "unit_cost_cents", "expected_at", "supplier")
  end

  it "keeps a run on its own product" do
    run = add_run
    get "/api/v1/admin/products/#{create(:product).slug}/production_runs", headers: headers
    expect(response.parsed_body["production_runs"]).to eq([])
    other = create(:product)
    post "/api/v1/admin/products/#{other.slug}/production_runs/#{run['id']}/receive", params: {}, headers: headers, as: :json
    expect(response).to have_http_status(:not_found)
    expect(product.reload.stock_quantity).to eq(10)
  end

  describe "receiving" do
    let!(:run) { add_run }

    it "adds the run's quantity by default, through the ledger, and records it on the run" do
      post "#{runs}/#{run['id']}/receive", params: {}, headers: headers, as: :json
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body["production_run"]).to include("status" => "received", "stock_added" => 500)
      expect(response.parsed_body["production_run"]["received_at"]).to be_present
      expect(response.parsed_body["product"]).to include("stock_quantity" => 510)
      movement = InventoryMovement.find_by!(product: product)
      expect(movement).to have_attributes(delta: 500, balance: 510, reason: "production_received", production_run_id: run["id"], order_id: nil)
      get "/api/v1/admin/products/#{product.slug}/inventory_movements", headers: headers
      expect(response.parsed_body["inventory_movements"].first).to include("reason" => "production_received", "production_run_id" => run["id"])
    end

    it "is idempotent: a double click can't add stock twice, even with a different count" do
      2.times { post "#{runs}/#{run['id']}/receive", params: { stock_added: 200 }, headers: headers, as: :json }
      expect(response).to have_http_status(:ok)
      post "#{runs}/#{run['id']}/receive", params: { stock_added: 300 }, headers: headers, as: :json
      expect(response.parsed_body["production_run"]).to include("status" => "received", "stock_added" => 200)
      expect(product.reload.stock_quantity).to eq(210)
      expect(InventoryMovement.where(production_run_id: run["id"]).count).to eq(1)
    end

    it "takes less than the quantity, or zero when the units were already allotted as preorders" do
      post "#{runs}/#{run['id']}/receive", params: { stock_added: 0 }, headers: headers, as: :json
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body["production_run"]).to include("status" => "received", "stock_added" => 0)
      expect(product.reload.stock_quantity).to eq(10)
      expect(InventoryMovement.where(product: product)).to be_empty
      partial = add_run
      post "#{runs}/#{partial['id']}/receive", params: { stock_added: 120 }, headers: headers, as: :json
      expect(product.reload.stock_quantity).to eq(130)
    end

    it "rejects a count that isn't a whole number from zero to the quantity" do
      [ -1, 501, "12", 1.5 ].each do |count|
        post "#{runs}/#{run['id']}/receive", params: { stock_added: count }, headers: headers, as: :json
        expect(response).to have_http_status(:unprocessable_content)
        expect(error).to include("code" => "invalid_production_run")
        expect(error["details"]).to have_key("stock_added")
      end
      expect(ProductionRun.find(run["id"]).status).to eq("ordered")
      expect(product.reload.stock_quantity).to eq(10)
    end

    it "refreshes a sold-out drop" do
      drop = create(:drop, sold_out_at: 1.day.ago)
      item = create(:product, :limited, drop: drop, stock_quantity: 0)
      created = item.production_runs.create!(quantity: 5)
      post "/api/v1/admin/products/#{item.slug}/production_runs/#{created.id}/receive", params: {}, headers: headers, as: :json
      expect(drop.reload.sold_out_at).to be_nil
      expect(drop.state).to eq("live")
    end

    it "freezes the quantity once received, but still takes notes" do
      post "#{runs}/#{run['id']}/receive", params: {}, headers: headers, as: :json
      patch "#{runs}/#{run['id']}", params: { quantity: 1 }, headers: headers, as: :json
      expect(error["details"]).to have_key("quantity")
      patch "#{runs}/#{run['id']}", params: { notes: "Two boxes dented" }, headers: headers, as: :json
      expect(response.parsed_body["production_run"]).to include("notes" => "Two boxes dented", "quantity" => 500)
    end

    it "has a database stop against a second movement for one run" do
      post "#{runs}/#{run['id']}/receive", params: {}, headers: headers, as: :json
      expect {
        InventoryMovement.create!(product: product, delta: 1, balance: 511, reason: "production_received", production_run_id: run["id"])
      }.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end

  describe "canceling" do
    let!(:run) { add_run }

    it "cancels once, without touching stock, and can't then be received" do
      2.times { post "#{runs}/#{run['id']}/cancel", params: {}, headers: headers, as: :json }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["production_run"]).to include("status" => "canceled")
      post "#{runs}/#{run['id']}/receive", params: {}, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(error["code"]).to eq("invalid_production_run")
      expect(product.reload.stock_quantity).to eq(10)
    end

    it "refuses to cancel a received run" do
      post "#{runs}/#{run['id']}/receive", params: {}, headers: headers, as: :json
      post "#{runs}/#{run['id']}/cancel", params: {}, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(ProductionRun.find(run["id"]).status).to eq("received")
    end
  end

  it "never puts costs or suppliers in a public payload" do
    add_run
    allow(StoreSetting).to receive(:sales_open?).and_return(true)
    [ "/api/v1/storefront", "/api/v1/products", "/api/v1/products/#{product.slug}", "/api/v1/drops" ].each do |path|
      get path
      expect(response.body).not_to match(/unit_cost|Shenzhen|production_run|supplier/)
    end
  end
end
