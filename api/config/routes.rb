Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  namespace :api do
    namespace :v1 do
      namespace :admin do
        get "me", to: "dashboard#me"
        get "dashboard", to: "dashboard#show"
        resources :orders, param: :number, only: [ :index, :show, :update ] do
          post :fulfill, on: :member
          post :unfulfill, on: :member
          post :refund, on: :member
          post :mark_paid, on: :member
          post "email_deliveries/:id/resend", to: "orders#resend", on: :member
        end
        resources :products, param: :slug, only: [ :index, :show, :create, :update ] do
          post :stock_adjustments, on: :member
          get :inventory_movements, on: :member
          resources :production_runs, only: [ :index, :create, :update ] do
            post :receive, on: :member
            post :cancel, on: :member
          end
        end
        resources :drops, param: :slug, only: [ :index, :show, :create, :update ]
        resources :uploads, only: :create
        resource :store, only: [ :show, :update ], controller: "store"
        resources :pages, param: :slug, only: [ :index, :show, :update ]
        resources :subscribers, only: :index
        resources :users, only: [ :index, :update ]
        resources :invitations, only: [ :create, :destroy ]
      end
      get "storefront", to: "catalog#storefront"
      get "store", to: "store#show"
      get "pages/:slug", to: "store#page"
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
