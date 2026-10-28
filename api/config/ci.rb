CI.run do
  step "Tests", "bundle exec rspec"
  step "Style", "bundle exec rubocop"
  step "Security: Brakeman", "bundle exec brakeman --no-pager --quiet"
  step "Security: Gem audit", "bundle exec bundler-audit check --update"
end
