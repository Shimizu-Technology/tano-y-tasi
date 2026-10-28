Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  namespace :api do
    namespace :v1 do
      get "storefront", to: "catalog#storefront"
      get "products", to: "catalog#products"
      get "products/:slug", to: "catalog#product"
      get "drops", to: "catalog#drops"
      get "drops/:slug", to: "catalog#drop"
      post "checkout", to: "checkout#create"
      get "orders/:token", to: "orders#show"
      post "orders/:token/cancel", to: "orders#cancel"
      post "webhooks/stripe", to: "webhooks#stripe"
      post "simulated_payments/:token/complete", to: "simulated_payments#complete"
      post "simulated_payments/:token/cancel", to: "simulated_payments#cancel"
      post "subscribers", to: "subscribers#create"
    end
  end
  match "*path", to: "application#not_found", via: :all
end
