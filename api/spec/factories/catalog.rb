FactoryBot.define do
  factory :drop do
    sequence(:slug) { |n| "drop-#{n}" }
    sequence(:number)
    name { "Guåhan Sunset Map" }
    release_at { 1.day.ago }
    quantity { 100 }
    per_customer_limit { 2 }
  end
  factory :product do
    sequence(:slug) { |n| "puzzle-#{n}" }
    name { "Håfa Adai from Tumon Bay" }
    kind { "core" }
    status { "active" }
    price_cents { 3500 }
    currency { "USD" }
    summary { "A piece of home." }
    description { "Guåhan, piece by piece." }
    stock_quantity { 50 }
    images { [ { "role" => "hero", "base" => "/images/puzzle", "widths" => [ 640 ], "aspect" => "1:1", "alt" => "A Guåhan puzzle" } ] }
    trait :limited do
      association :drop
      kind { "drop" }
    end
  end
end
