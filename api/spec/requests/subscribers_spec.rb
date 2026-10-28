require "rails_helper"

RSpec.describe "Subscribers", type: :request do
  it "normalizes email and returns 201 then 200" do
    post "/api/v1/subscribers", params: { email: "Buyer@example.com ", source: "drop", drop_slug: "drop-001" }, as: :json
    expect(response).to have_http_status(:created)
    expect(response.parsed_body).to eq("subscribed" => true)
    post "/api/v1/subscribers", params: { email: "buyer@EXAMPLE.COM", source: "footer" }, as: :json
    expect(response).to have_http_status(:ok)
    expect(Subscriber.count).to eq(1)
    expect(Subscriber.first.email).to eq("buyer@example.com")
  end

  [ nil, "no-email", "", [ "a@example.com" ] ].each do |email|
    it "rejects invalid email #{email.inspect}" do
      post "/api/v1/subscribers", params: { email: email }, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body.dig("error", "code")).to eq("invalid_email")
    end
  end

  it "throttles subscriptions at five requests per minute" do
    6.times { post "/api/v1/subscribers", params: { email: "bad" }, as: :json }
    expect(response).to have_http_status(:too_many_requests)
    expect(response.parsed_body.dig("error", "code")).to eq("rate_limited")
  end

  it "only grants CORS to the configured web origin" do
    get "/api/v1/products", headers: { "Origin" => "http://localhost:5181" }
    expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:5181")
    get "/api/v1/products", headers: { "Origin" => "https://untrusted.example.com" }
    expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
  end
  it "shares the subscription throttle across equivalent routes" do
    paths = [ "/api/v1/subscribers", "/api/v1/subscribers/", "/api/v1/subscribers.json" ]
    6.times do |index|
      post paths[index % paths.size], params: { email: "bad" }, as: :json
    end
    expect(response).to have_http_status(:too_many_requests)
  end
end
