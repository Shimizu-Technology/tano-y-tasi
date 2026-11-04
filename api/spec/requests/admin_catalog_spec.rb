require "rails_helper"
require_relative "../support/admin_auth"

RSpec.describe "Admin catalog", type: :request do
  include_context "admin auth"

  let(:bucket_url) { "https://tano-y-tasi-media.s3.ap-southeast-1.amazonaws.com" }
  let(:new_product) { { name: "Håfa Adai Mañana", summary: "A piece of home.", description: "Made for Guåhan.", price_cents: 2500 } }
  let(:image) { { role: "hero", alt: "The Tumon Bay puzzle", base: "/images/products/new/flat", widths: [ 640, 1280 ], aspect: "4:3" } }

  def error
    response.parsed_body["error"]
  end

  def with_storage(values = { "AWS_ACCESS_KEY_ID" => "test-only-key", "AWS_SECRET_ACCESS_KEY" => "test-only-secret", "AWS_REGION" => "ap-southeast-1", "AWS_S3_BUCKET" => "tano-y-tasi-media" })
    keys = %w[AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION AWS_S3_BUCKET]
    saved = keys.to_h { |key| [ key, ENV[key] ] }
    keys.each { |key| ENV.delete(key) }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  describe "POST /products" do
    it "creates a draft with no stock and a slug from the name" do
      post "/api/v1/admin/products", params: new_product.merge(stock_quantity: 99, currency: "EUR", specs: { piece_count: 100 }, includes: [ "Puzzle" ], art: { credit: "Christian", story: "Guåhan" }, placeholders: [ "specs.box_size" ]), headers: headers, as: :json
      expect(response).to have_http_status(:created)
      expect(response.parsed_body["product"]).to include("slug" => "hafa-adai-manana", "status" => "draft", "kind" => "core", "stock_quantity" => 0, "currency" => "USD",
        "specs" => { "piece_count" => 100 }, "includes" => [ "Puzzle" ], "placeholders" => [ "specs.box_size" ], "images" => [], "drop" => nil)
      expect(InventoryMovement.count).to eq(0)
    end

    it "adds a suffix on a slug collision and places new products last" do
      create(:product, slug: "hafa-adai-manana", position: 7)
      create(:product, slug: "hafa-adai-manana-2")
      post "/api/v1/admin/products", params: new_product, headers: headers, as: :json
      expect(response.parsed_body["product"]).to include("slug" => "hafa-adai-manana-3", "position" => 8)
    end

    it "keeps the create screen's address free and survives a name with no latin letters" do
      post "/api/v1/admin/products", params: new_product.merge(name: "New"), headers: headers, as: :json
      expect(response.parsed_body.dig("product", "slug")).to eq("new-2")
      post "/api/v1/admin/products", params: new_product.merge(name: "ꓸꓸꓸ"), headers: headers, as: :json
      expect(response.parsed_body.dig("product", "slug")).to eq("product")
    end

    it "reports validation errors field by field" do
      post "/api/v1/admin/products", params: { name: "", price_cents: -1, status: "secret" }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(error["code"]).to eq("invalid_record")
      expect(error["details"].keys).to include("name", "summary", "description", "price_cents", "status")
      expect(error["details"]).not_to have_key("slug")
    end

    it "rejects an integer too large for the database instead of failing" do
      post "/api/v1/admin/products", params: new_product.merge(price_cents: 2_147_483_648), headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(error["details"]).to have_key("price_cents")
    end

    it "can start in a drop that already holds a product, but not in an unknown one" do
      drop = create(:drop)
      post "/api/v1/admin/products", params: new_product.merge(kind: "drop", drop_slug: drop.slug), headers: headers, as: :json
      expect(response.parsed_body["product"]).to include("kind" => "drop")
      expect(response.parsed_body.dig("product", "drop", "slug")).to eq(drop.slug)
      post "/api/v1/admin/products", params: new_product.merge(kind: "drop", drop_slug: drop.slug), headers: headers, as: :json
      expect(response).to have_http_status(:created)
      expect(drop.reload.products.size).to eq(2)
      post "/api/v1/admin/products", params: new_product.merge(kind: "drop", drop_slug: "missing"), headers: headers, as: :json
      expect(error["details"]).to have_key("drop_slug")
      post "/api/v1/admin/products", params: new_product.merge(kind: "drop"), headers: headers, as: :json
      expect(error["details"]).to have_key("drop_slug")
      post "/api/v1/admin/products", params: new_product.merge(kind: "weird"), headers: headers, as: :json
      expect(error["details"]).to have_key("kind")
    end
  end

  describe "PATCH /products/:slug placement" do
    let!(:drop) { create(:drop, release_at: nil) }
    let!(:map) { create(:product, :limited, drop: drop, stock_quantity: 500) }
    let!(:core) { create(:product) }

    it "moves the map from its drop to the always-available collection, and back" do
      patch "/api/v1/admin/products/#{map.slug}", params: { kind: "core" }, headers: headers, as: :json
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body["product"]).to include("kind" => "core", "drop" => nil, "stock_quantity" => 500)
      expect(map.reload).to have_attributes(kind: "core", drop_id: nil)
      get "/api/v1/products/#{map.slug}"
      expect(response.parsed_body.dig("product", "availability", "purchasable")).to be(true)
      get "/api/v1/storefront"
      expect(response.parsed_body["core_products"].map { |product| product["slug"] }).to include(map.slug)
      expect(response.parsed_body["featured_drop"]).to be_nil
      patch "/api/v1/admin/products/#{map.slug}", params: { kind: "drop", drop_slug: drop.slug }, headers: headers, as: :json
      expect(map.reload).to have_attributes(kind: "drop", drop_id: drop.id)
    end

    it "accepts a drop_slug alone, an explicit null slug for core, and keeps the drop when only kind is repeated" do
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "core", drop_slug: nil }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      other = create(:drop)
      patch "/api/v1/admin/products/#{core.slug}", params: { drop_slug: other.slug }, headers: headers, as: :json
      expect(core.reload).to have_attributes(kind: "drop", drop_id: other.id)
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "drop" }, headers: headers, as: :json
      expect(core.reload.drop_id).to eq(other.id)
    end

    it "attaches a second product to a drop and refuses contradictions" do
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "drop", drop_slug: drop.slug }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.dig("product", "drop", "products").map { |item| item["slug"] }).to contain_exactly(map.slug, core.slug)
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "core" }, headers: headers, as: :json
      expect(core.reload).to have_attributes(kind: "core", drop_id: nil)
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "core", drop_slug: drop.slug }, headers: headers, as: :json
      expect(error["details"]).to have_key("drop_slug")
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "drop" }, headers: headers, as: :json
      expect(error["details"]).to have_key("drop_slug")
      expect(core.reload).to have_attributes(kind: "core", drop_id: nil)
    end

    it "refreshes the sold-out date of the drop a product leaves" do
      other = create(:product, :limited, drop: drop, stock_quantity: 0)
      patch "/api/v1/admin/products/#{map.slug}", params: { kind: "core" }, headers: headers, as: :json
      expect(drop.reload.sold_out_at).to be_present
      expect(drop.out_of_stock?).to be(true)
      patch "/api/v1/admin/products/#{map.slug}", params: { kind: "drop", drop_slug: drop.slug }, headers: headers, as: :json
      expect(drop.reload.sold_out_at).to be_nil
      expect(other.reload.drop).to eq(drop)
    end

    it "clears a sold-out date left by the drop's previous product" do
      drop.update!(sold_out_at: 1.day.ago)
      patch "/api/v1/admin/products/#{map.slug}", params: { kind: "core" }, headers: headers, as: :json
      patch "/api/v1/admin/products/#{core.slug}", params: { kind: "drop", drop_slug: drop.slug }, headers: headers, as: :json
      expect(drop.reload.sold_out_at).to be_nil
    end
  end

  describe "PATCH /products/:slug images" do
    let!(:product) { create(:product) }

    def save_images(images)
      patch "/api/v1/admin/products/#{product.slug}", params: { images: images }, headers: headers, as: :json
    end

    it "saves an ordered list and drops unknown keys" do
      second = image.merge(role: "detail", base: "/images/products/new/detail", evil: "x")
      save_images([ second, image ])
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body.dig("product", "images").map { |item| item["role"] }).to eq(%w[detail hero])
      expect(product.reload.images.first).not_to have_key("evil")
    end

    it "accepts a URL under the bucket's products/ prefix once the bucket is configured" do
      remote = image.merge(base: "#{bucket_url}/products/#{product.slug}/abc123")
      with_storage { save_images([ remote ]) }
      expect(response).to have_http_status(:ok), response.body
      with_storage({}) { save_images([ remote.merge(base: "#{remote[:base]}-other") ]) }
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "rejects every base that isn't a safe local path or bucket product path" do
      with_storage do
        [ "/products/x", "/images/", "/images/../../etc", "/images//evil.example/x", "/images/a b", "/images/a,1x", "/images/a?x=1", "//evil.example/images/x",
          "https://evil.example/products/x", "#{bucket_url}/other/x", "#{bucket_url}/products/", "#{bucket_url}/products/../x", "#{bucket_url}.evil.example/products/x",
          "http://tano-y-tasi-media.s3.ap-southeast-1.amazonaws.com/products/x", "javascript:alert(1)", nil, 7 ].each do |base|
          save_images([ image.merge(base: base) ])
          expect(response).to have_http_status(:unprocessable_content), "accepted #{base.inspect}"
          expect(error.dig("details", "images").join).to match(/base/)
        end
      end
    end

    it "requires a role, alt text, aspect and positive whole-number widths" do
      { role: "banner", alt: "  ", aspect: "wide", widths: [] }.each do |key, value|
        save_images([ image.merge(key => value) ])
        expect(response).to have_http_status(:unprocessable_content), "accepted #{key}"
        expect(error.dig("details", "images").join).to include("image 1")
      end
      [ [ 0 ], [ -1 ], [ "640" ], [ 1.5 ], "640" ].each do |widths|
        save_images([ image.merge(widths: widths) ])
        expect(response).to have_http_status(:unprocessable_content), "accepted #{widths.inspect}"
      end
      [ image.except(:role), image.except(:alt), image.except(:base), image.except(:widths), image.except(:aspect) ].each do |partial|
        save_images([ partial ])
        expect(response).to have_http_status(:unprocessable_content)
      end
      expect(product.reload.images.first["base"]).to eq("/images/puzzle")
    end

    it "treats a malformed list as an error, never as an empty list" do
      [ "x", [ "x" ], { role: "hero" }, nil ].each do |images|
        save_images(images)
        expect(response).to have_http_status(:unprocessable_content), "accepted #{images.inspect}"
      end
      expect(product.reload.images).not_to be_empty
    end

    it "lets existing data with old shapes through stock changes untouched" do
      product.update_column(:images, [ { "base" => "/legacy" } ])
      post "/api/v1/admin/products/#{product.slug}/stock_adjustments", params: { delta: 1, reason: "Count" }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
    end
  end

  describe "an active product with no image yet" do
    let!(:product) { create(:product, images: [], slug: "no-art-yet") }
    let!(:drop) { create(:drop) }
    let!(:drop_product) { create(:product, :limited, drop: drop, images: []) }

    it "is hidden from every public page but stays visible to admins" do
      get "/api/v1/storefront"
      expect(response.parsed_body).to include("core_products" => [], "featured_drop" => nil)
      get "/api/v1/products"
      expect(response.parsed_body["products"]).to eq([])
      get "/api/v1/products/#{product.slug}"
      expect(response).to have_http_status(:not_found)
      get "/api/v1/drops"
      expect(response.parsed_body).to include("current" => nil, "upcoming" => [], "archive" => [])
      get "/api/v1/drops/#{drop.slug}"
      expect(response).to have_http_status(:not_found)
      get "/api/v1/admin/products", headers: headers
      expect(response.parsed_body["products"].map { |item| item["slug"] }).to include(product.slug)
    end

    it "can't be bought until it has one" do
      Product.where(id: product.id).update_all(stock_quantity: 5)
      post "/api/v1/checkout", params: with_shipping({ email: "a@example.com", idempotency_key: SecureRandom.uuid, items: [ { product_slug: product.slug, quantity: 1 } ] }), as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(error["code"]).to eq("unknown_product")
      expect(product.reload.stock_quantity).to eq(5)
    end
  end

  describe "POST /drops" do
    it "assigns the next number and a numbered slug, with no product" do
      create(:drop, number: 7)
      post "/api/v1/admin/drops", params: { name: "Håfa Adai Mañana", per_customer_limit: 3, quantity: 200, release_at: "2027-01-02T00:00:00Z", closes_at: "2027-01-03T00:00:00Z", number: 99, slug: "x" }, headers: headers, as: :json
      expect(response).to have_http_status(:created), response.body
      expect(response.parsed_body["drop"]).to include("slug" => "drop-008-hafa-adai-manana", "number" => 8, "per_customer_limit" => 3, "quantity" => 200, "product" => nil, "state" => "upcoming")
    end

    it "defaults to coming soon, limit 2 and an undecided quantity customers never see" do
      post "/api/v1/admin/drops", params: { name: "Next" }, headers: headers, as: :json
      expect(response.parsed_body["drop"]).to include("slug" => "drop-001-next", "release_at" => nil, "closes_at" => nil, "per_customer_limit" => 2, "quantity" => 0)
      drop = Drop.find_by!(slug: "drop-001-next")
      expect(drop.public_quantity).to be_nil
    end

    it "names a drop with no latin letters by its number" do
      post "/api/v1/admin/drops", params: { name: "ꓸꓸꓸ" }, headers: headers, as: :json
      expect(response.parsed_body.dig("drop", "slug")).to eq("drop-001")
    end

    it "reports validation errors field by field" do
      post "/api/v1/admin/drops", params: { name: "", per_customer_limit: 0, quantity: -1 }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(error["details"].keys).to include("name", "per_customer_limit", "quantity")
      post "/api/v1/admin/drops", params: { name: "x", release_at: "2027-01-03T00:00:00Z", closes_at: "2027-01-02T00:00:00Z" }, headers: headers, as: :json
      expect(error["details"]).to have_key("release_at")
    end

    it "refuses an unreadable date on create and update instead of making it coming soon" do
      post "/api/v1/admin/drops", params: { name: "x", release_at: "soon" }, headers: headers, as: :json
      expect(error.dig("details", "release_at")).to be_present
      drop = create(:drop)
      patch "/api/v1/admin/drops/#{drop.slug}", params: { closes_at: "2027-13-45T00:00:00Z" }, headers: headers, as: :json
      expect(error.dig("details", "closes_at")).to be_present
      expect(drop.reload.release_at).to be_present
    end

    it "shows a released drop with no product as upcoming and keeps it off the dashboard" do
      drop = create(:drop)
      get "/api/v1/admin/drops/#{drop.slug}", headers: headers
      expect(response.parsed_body.dig("drop", "state")).to eq("upcoming")
      get "/api/v1/admin/dashboard", headers: headers
      expect(response.parsed_body["featured_drop"]).to be_nil
    end
  end

  describe "POST /uploads" do
    let!(:product) { create(:product, slug: "hafa-adai") }
    let(:request_body) { { product_slug: "hafa-adai", widths: [ 640, 1280, 2000 ], content_type: "image/webp" } }

    # Presigning is local signing. WebMock would fail this spec if it ever reached AWS.
    it "returns one signed PUT per width, for the Cache-Control and type it requires" do
      freeze_time do
        with_storage { post "/api/v1/admin/uploads", params: request_body, headers: headers, as: :json }
      end
      expect(response).to have_http_status(:created), response.body
      body = response.parsed_body
      expect(body["base"]).to match(%r{\A#{Regexp.escape(bucket_url)}/products/hafa-adai/[0-9a-f]{24}\z})
      expect(body["uploads"].map { |upload| upload["width"] }).to eq([ 640, 1280, 2000 ])
      body["uploads"].each do |upload|
        uri = URI.parse(upload["url"])
        query = Rack::Utils.parse_query(uri.query)
        expect("#{uri.scheme}://#{uri.host}#{uri.path}").to eq("#{body["base"]}-#{upload["width"]}.webp")
        expect(query).to include("X-Amz-Expires" => "900", "X-Amz-SignedHeaders" => "cache-control;content-type;host")
        expect(query.keys.grep(/checksum/i)).to be_empty
        expect(upload["headers"]).to eq("Content-Type" => "image/webp", "Cache-Control" => "public, max-age=31536000, immutable")
      end
    end

    it "accepts its own result as a product image" do
      with_storage do
        post "/api/v1/admin/uploads", params: request_body, headers: headers, as: :json
        base = response.parsed_body["base"]
        patch "/api/v1/admin/products/hafa-adai", params: { images: [ image.merge(base: base, widths: [ 640, 1280, 2000 ]) ] }, headers: headers, as: :json
      end
      expect(response).to have_http_status(:ok), response.body
    end

    it "uses a different object name each time" do
      bases = with_storage do
        2.times.map do
          post "/api/v1/admin/uploads", params: request_body, headers: headers, as: :json
          response.parsed_body["base"]
        end
      end
      expect(bases.uniq.size).to eq(2)
    end

    it "allows only WebP and a small set of sensible widths" do
      with_storage do
        [ "image/png", "image/svg+xml", nil ].each do |type|
          post "/api/v1/admin/uploads", params: request_body.merge(content_type: type), headers: headers, as: :json
          expect(response).to have_http_status(:unprocessable_content), "accepted #{type.inspect}"
          expect(error["code"]).to eq("invalid_upload")
        end
        [ [], [ 99 ], [ 4001 ], [ 640, 640 ], [ "640" ], [ 640.5 ], (1..7).map { |n| 640 + n }, "640", nil ].each do |widths|
          post "/api/v1/admin/uploads", params: request_body.merge(widths: widths), headers: headers, as: :json
          expect(response).to have_http_status(:unprocessable_content), "accepted #{widths.inspect}"
          expect(error["details"]).to have_key("widths")
        end
        post "/api/v1/admin/uploads", params: request_body.merge(widths: [ 100, 4000 ]), headers: headers, as: :json
        expect(response).to have_http_status(:created)
      end
    end

    it "is 404 for an unknown product" do
      with_storage { post "/api/v1/admin/uploads", params: request_body.merge(product_slug: "nope"), headers: headers, as: :json }
      expect(response).to have_http_status(:not_found)
    end

    it "is a clear 503 when storage isn't configured" do
      %w[AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION AWS_S3_BUCKET].each do |missing|
        values = { "AWS_ACCESS_KEY_ID" => "key", "AWS_SECRET_ACCESS_KEY" => "secret", "AWS_REGION" => "ap-southeast-1", "AWS_S3_BUCKET" => "bucket" }.except(missing)
        with_storage(values) { post "/api/v1/admin/uploads", params: request_body, headers: headers, as: :json }
        expect(response).to have_http_status(:service_unavailable)
        expect(error["code"]).to eq("storage_unavailable")
      end
    end
  end

  it "reports a drop out of stock by the products actually on sale" do
    drop = create(:drop)
    create(:product, :limited, drop: drop, stock_quantity: 0)
    create(:product, :limited, drop: drop, stock_quantity: 500, status: "archived")
    get "/api/v1/admin/drops/#{drop.slug}", headers: headers
    expect(response.parsed_body["drop"]).to include("state" => "sold_out", "out_of_stock" => true)
  end
end

RSpec.describe "Admin catalog concurrency" do
  self.use_transactional_tests = false

  after do
    Product.where("slug LIKE 'race%'").delete_all
    Drop.where("slug LIKE 'drop-%-race%'").delete_all
  end

  def race(count)
    ready, start = Queue.new, Queue.new
    threads = count.times.map do |index|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          yield index
        end
      end
    end
    count.times { ready.pop }
    count.times { start << true }
    threads.map(&:value)
  end

  it "gives concurrent new products different slugs" do
    products = race(6) { |_| AdminCatalog.create_product({ name: "Race", summary: "s", description: "d", price_cents: 1, kind: "core", drop: nil }.with_indifferent_access) }
    expect(products.map(&:slug).sort).to eq(%w[race race-2 race-3 race-4 race-5 race-6])
  end

  it "gives concurrent new drops different numbers" do
    drops = race(6) { |index| AdminCatalog.create_drop({ name: "Race #{index}" }.with_indifferent_access) }
    expect(drops.map(&:number).uniq.size).to eq(6)
    expect(drops.map(&:slug)).to all(match(/\Adrop-\d{3}-race-\d\z/))
  end

  it "lets several products join a drop at once" do
    drop = Drop.create!(slug: "drop-900-race", number: 900, name: "Race", quantity: 0)
    results = race(4) { |index| AdminCatalog.create_product({ name: "Race #{index}", summary: "s", description: "d", price_cents: 1, kind: "drop", drop: drop }.with_indifferent_access).slug }
    expect(drop.products.reload.map(&:slug)).to match_array(results)
  end
end
