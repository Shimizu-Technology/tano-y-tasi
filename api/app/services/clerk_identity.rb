class ClerkIdentity
  def self.profile(clerk_id)
    user = ClerkClient.request(:get, "users/#{ERB::Util.url_encode(clerk_id)}")
    raise ClerkClient::Unavailable, "Invalid Clerk identity response" unless user.is_a?(Hash) && user["id"] == clerk_id && user["email_addresses"].is_a?(Array) && user["email_addresses"].all? { |address| address.is_a?(Hash) }
    primary = user["email_addresses"].find { |address| address["id"] == user["primary_email_address_id"] }
    return nil unless primary && primary["verification"].is_a?(Hash) && primary.dig("verification", "status") == "verified"
    email = primary["email_address"].to_s.strip.downcase
    return nil unless email.match?(URI::MailTo::EMAIL_REGEXP)
    { email: email, name: [ user["first_name"], user["last_name"] ].compact.join(" ").presence }
  end
end
