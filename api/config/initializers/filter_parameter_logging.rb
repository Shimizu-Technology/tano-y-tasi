Rails.application.config.filter_parameters += [ :email, :token, :order_token, :shipping, :address, :idempotency_key, :payment_url, :secret, :signature ]
Rails.application.config.filter_parameters += [ :password, :password_confirmation, :api_key, :access_token, :credit_card ]
