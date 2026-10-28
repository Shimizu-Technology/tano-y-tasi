# Tåno + Tåsi API

Rails 8.1, Ruby 3.3.4, PostgreSQL 16. The shared interface is [API_CONTRACT.md](../docs/API_CONTRACT.md). No Redis or job worker is needed.

## Setup

Use Ruby 3.3.4, install Bundler, then run `bundle install` inside `api/`. Copy `.env.example` to `.env`. Local Postgres uses `/tmp:5432` by default. Create only the two named databases if they do not already exist:

```sh
createdb -h /tmp tano_y_tasi_development
createdb -h /tmp tano_y_tasi_test
bin/rails runner 'puts ActiveRecord::Base.connection.current_database'
# Continue only if this prints tano_y_tasi_development.
bin/rails db:migrate
bin/rails runner 'puts ActiveRecord::Base.connection.current_database'
bin/rails db:seed
RAILS_ENV=test bin/rails runner 'puts ActiveRecord::Base.connection.current_database'
# Continue only if this prints tano_y_tasi_test.
RAILS_ENV=test bin/rails db:migrate
bin/rails server -p 3031
```

Always check the connected database with `rails runner` before **each** `db:` command. Never reset/drop another project's database. Development/test boot rejects a `DATABASE_URL` with the wrong database name. `bin/setup` guards the development database before migrating; it never creates or resets databases. SQL schema format preserves the order-number sequence.

## Environment

- `PAYMENT_PROVIDER`: defaults to `simulated` in development/test. Production requires `stripe` and refuses simulated payments.
- `WEB_APP_URL`: web origin (default `http://localhost:5181` locally). A comma-separated allowlist is accepted for CORS; payment return URLs use the first origin. HTTPS is required in production.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: required when Stripe is selected. Never commit keys. Point Stripe webhooks at `/api/v1/webhooks/stripe`.
- `API_HOSTS`: comma-separated API hostnames, without schemes or ports. Localhost is included. Add the deployed API host explicitly.
- `DATABASE_URL`: CI/production connection string. CI must target `tano_y_tasi_test`. `PGHOST` and `PGPORT` configure local sockets.
- `RAILS_MAX_THREADS`: connection pool and Puma thread count (default 20). Concurrency specs need at least 13 connections.
- `SECRET_KEY_BASE`: required for production. `FORCE_SSL` / `ASSUME_SSL` default true in production and parse explicit booleans; set according to the hosting proxy.

Throttles use bounded, process-local memory: checkout 10/min/IP and subscribers 5/min/IP. Use an edge/global throttle when running multiple processes. Rails trusts only its default trusted proxies; configure deployment forwarding carefully rather than trusting arbitrary forwarded IPs.

## Inventory and payments

Checkout reserves inventory and creates immutable item snapshots in one transaction, locking product rows by ascending ID. The payment session is created after commit. A per-key PostgreSQL session advisory lock serializes identical checkout keys through session setup without holding inventory locks during network calls. Stripe also receives an order-scoped idempotency key. Provider failure cancels the order and restores stock in a new transaction.

All releases and completions lock products in the same order, then the order. Only a pending order releases stock, so cancel/expire retries restore it once. Late payments re-reserve released stock atomically; insufficient stock becomes `needs_attention` and logs a refund-required error. Payment events and their state transitions commit together. Inventory movements record every reservation, release, and late reservation.

Holds last 30 minutes. Lazy cleanup releases up to 100 orders whose expiry is more than five minutes old, allowing Stripe completions in flight. Schedule `bin/rails orders:release_expired` every minute in production; increase cadence or invoke repeatedly to drain a backlog. Pending stock remains reserved through the grace period. Orders show their persisted state; catalog reads and new checkout trigger lazy cleanup.

Simulated checkout returns a URL under `/checkout/simulated/:token`; POST its `complete` or `cancel` API endpoint to finish QA. Both routes return JSON order data and 404 when simulation is inactive. Stripe completion requires `payment_status=paid` and matching session/amount/currency. Delayed-payment success (`checkout.session.async_payment_succeeded`) uses the same completion path. A payment arriving after release re-reserves stock or needs a human refund; do not offer delayed methods until that operational refund process is staffed.

## Catalog QA

`db:seed` upserts by slug, preserving existing stock and drop timing. Commercial placeholders are labeled in the payload. In development only:

```sh
bin/rails 'dev:drop_state[upcoming]'
bin/rails 'dev:drop_state[live]'
bin/rails 'dev:drop_state[sold_out]'
bin/rails 'dev:drop_state[closed]'
```

The state task refuses pending drop holds. It resets seeded stock for QA; it is never available in production. Restore the canonical release time in a development runner if needed: `2026-12-05T00:00:00Z`.

## Verification

```sh
bundle exec rspec
bundle exec rubocop
bundle exec brakeman --no-pager --quiet
bundle exec bundler-audit check --update
```

Specs refuse any database except `tano_y_tasi_test`; they do not auto-load schemas. Most specs use transactions. Concurrency specs use twelve separate real PostgreSQL connections and delete only their own fixture rows. WebMock blocks network calls. CI runs the same gates against Postgres 16.

Stripe integration caveat: the required 30-minute hold is sent unchanged as `expires_at`. [Stripe requires at least 30 minutes from session creation](https://docs.stripe.com/api/checkout/sessions/create#creating_checkout_session-expires_at), so elapsed reservation/network time can cause rejection at that lower boundary. The lead must resolve a small expiry buffer with the shared contract before real Stripe rollout; this foundation preserves the binding 30-minute contract and safely releases failed sessions.

Public order tokens are bearer secrets; do not publish order links or log tokens. Transactional email, refunds, shipping rates/tax, admin, and reconciliation automation remain outside this foundation's scope.
