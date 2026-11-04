# Tåno + Tåsi API

Rails 8.1, Ruby 3.3.4, PostgreSQL 16. The shared interfaces are [API_CONTRACT.md](../docs/API_CONTRACT.md) and [ADMIN_API_CONTRACT.md](../docs/ADMIN_API_CONTRACT.md). No Redis or job worker is needed.

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

Always check the connected database with `rails runner` before **each** `db:` command. Never reset/drop another project's database. Development/test boot rejects a configuration with the wrong database name. Production boot also checks the resolved name, including during `db:migrate`, before opening a connection. `bin/setup` guards the development database before migrating; it never creates or resets databases. SQL schema format preserves the order-number sequence.

## Environment

- `PAYMENT_PROVIDER`: defaults to `simulated` in development/test. Production requires `stripe` and refuses simulated payments.
- `WEB_APP_URL`: web origin (default `http://localhost:5181` locally). A comma-separated allowlist is accepted for CORS; payment return URLs use the first origin. HTTPS is required in production.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: required when Stripe is selected. Never commit keys. Point Stripe webhooks at `/api/v1/webhooks/stripe`.
- `API_HOSTS`: comma-separated API hostnames, without schemes or ports. Localhost is included. Add the deployed API host explicitly.
- `DATABASE_URL`: CI/production connection string. CI must target `tano_y_tasi_test`. `PGHOST` and `PGPORT` configure local sockets.
- `EXPECTED_DATABASE_NAME`: production database allowlist containing one exact database name. `bin/release-migrate` requires it and aborts unless the connected name matches exactly. Set this explicitly when hosting assigns a different name.
- `RAILS_MAX_THREADS`: connection pool (local default 20) and Puma thread count (default 3). Set 3 on Render; concurrency specs need at least 13 connections.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`: product image uploads. Local work doesn't need them; uploads then return `503 storage_unavailable`.
- `SECRET_KEY_BASE`: required for production. `FORCE_SSL` / `ASSUME_SSL` default true in production and parse explicit booleans; set according to the hosting proxy.

Throttles use bounded, process-local memory: checkout 10/min/IP and subscribers 5/min/IP. Use an edge/global throttle when running multiple processes. Rails trusts only its default trusted proxies; configure deployment forwarding carefully rather than trusting arbitrary forwarded IPs.

## Inventory and payments

Checkout reserves inventory and creates immutable item snapshots in one transaction, locking product rows by ascending ID. The Stripe session expiry is persisted with the hold before the provider call. Session creation uses the saved expiry and item snapshots on every retry, with an order-scoped Stripe idempotency key. A per-key PostgreSQL session advisory lock serializes identical checkout keys through session setup without holding inventory locks during network calls.

Definitive Stripe rejection (`InvalidRequestError` or `IdempotencyError`) cancels the order, restores stock, and returns `503 payment_unavailable` instructing the customer to start a new checkout. Connection failures, timeouts, rate limits, and provider API errors preserve the order and hold; the 503 instructs the client to retry the identical payload and idempotency key. A crash after Stripe creates a session can recover through the same request. An unrecovered hold expires normally.

All releases and completions lock products in the same order, then the order. Only a pending order releases stock, so cancel/expire retries restore it once. Checkout counts paid orders, all pending orders (including the grace period), and paid `needs_attention` orders toward each drop's customer limit. Completion rechecks that limit under the product locks, excluding its own order. An over-limit payment becomes `needs_attention`, records payment details, releases any pending reservation exactly once, and logs `reason=customer_limit_exceeded refund_required=true`. Paid attention orders continue counting until the refund is reconciled. Late payments re-reserve released stock atomically only when both the limit and stock permit it; insufficient stock also requires attention and a refund. Payment events and their state transitions commit together. Inventory movements record every reservation, release, and late reservation.

Simulated holds last 30 minutes; Stripe holds use a persisted 31-minute window to allow for session creation latency while meeting Stripe's 30-minute minimum. Lazy cleanup releases up to 100 orders whose expiry is more than five minutes old, allowing Stripe completions in flight. Schedule `bin/rails orders:release_expired` every minute in production; increase cadence or invoke repeatedly to drain a backlog. The task also retries closing up to 100 released Stripe sessions per run. Pending stock remains reserved through the grace period. Orders show their persisted state; catalog reads and new checkout trigger lazy inventory cleanup.

`provider_session_closed_at` stays null until Stripe confirms expiration or completion. Cancellation retries an unclosed Stripe session even when the order is already canceled or expired, without releasing stock again. Async failure also attempts closure after its inventory transaction. Failed closure is logged and left for a later cancel or scheduled retry. An expiry webhook confirms closure, including after a prior release. If Stripe rejects expiration because the session is already expired or complete, retrieval confirms that status before marking it closed. All provider calls remain outside inventory locks.

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

The fixed Stripe expiry never moves on retry. A provider rejection after the minimum session window has elapsed follows the definitive-rejection path; the client must start a new checkout.

Public order tokens are bearer secrets; do not publish order links or log tokens. Refunds, shipping rates/tax, and reconciliation automation remain outside this phase's scope.


## Admin access and transactional email

Configure the Clerk application for Restricted sign-up. Rails verifies RS256 signatures with the usable JWKS key matching the token `kid`, derives the issuer from `CLERK_PUBLISHABLE_KEY`, checks issuer/expiry/not-before, and checks `azp` when present. The validated JWKS cache lasts one hour; an unknown `kid` gets one single-flight refresh at most once per minute so normal key rotation does not wait for cache expiry. Unusable JWKS responses return 503 and are not cached. `CLERK_AUTHORIZED_PARTIES` must be explicitly configured. A verified primary email from the Clerk Backend API can provision an admin only through `ADMIN_EMAILS` or a pending invitation. Normalized admin emails are unique. Existing inactive users cannot bootstrap again under a new Clerk ID, and an active email is never silently relinked to a different Clerk ID. Tokens never supply email or role authority. Missing/invalid Clerk configuration and dependency outages return 503 on admin access without preventing storefront boot.

The paid transition writes recipient-level email records in the transaction, then sends inline after the outermost transaction commits. Fulfillment uses the same pattern. Network sends never hold an order/inventory transaction. Failed delivery is recorded and logged without failing payment processing. Resends serialize through a PostgreSQL session advisory lock; retries reuse the saved payload and idempotency key. Explicit admin resends create a new key generation and payload. Customer keys are `kind-token`; admin notices append a recipient digest so multiple admins do not collide. Disabled delivery records `skipped` and sends nothing.

Run `bin/rails emails:retry_failed` from a scheduled job/operator session to recover failed or crash-interrupted pending deliveries with fewer than five attempts. It runs inline and needs no worker/Redis. A successful Resend API response means provider acceptance, not mailbox delivery. There is no delivery webhook tracking in this phase. Automatic retries reuse the original key; Resend's finite idempotency retention means an uncertain outcome retried after the provider retention window requires operator reconciliation to avoid duplicates.

## Render + Neon deployment

The root `render.yaml` deploys `main` to `tano-y-tasi-api` in Singapore on Render Starter, using the Dockerfile under `api/`. It uses one Puma process (`workers 0`), three threads, `/up` as a database-free boot check, and `bin/release-migrate` as the pre-deploy command. No jemalloc was added because the HafaPass reference image does not use it. The image builds gems in a separate stage and runs as an unprivileged user.

Use a pooled Neon `DATABASE_URL` at runtime (`prepared_statements: false`), and a separate direct `DATABASE_MIGRATION_URL` for PostgreSQL migration advisory locks. In production, the release script aborts before boot unless both `DATABASE_MIGRATION_URL` and `EXPECTED_DATABASE_NAME` are present. It rejects a migration URL equal to `DATABASE_URL` or whose host contains `-pooler`, then requires the connected database name to match `EXPECTED_DATABASE_NAME` exactly before migrating and again before seeding. Seeds upsert the catalog, preserve existing inventory/drop timing, and never alter orders. They do refresh seeded catalog copy/prices and drop name/limit, so review catalog changes before a deploy.

Set the following environment variables in Render (also documented in `.env.example`):

| Variable | Production setting / purpose |
| --- | --- |
| `DATABASE_URL` | Secret pooled Neon connection URL, `sslmode=require`. |
| `DATABASE_MIGRATION_URL` | Required secret direct Neon connection URL. It must differ from `DATABASE_URL`, and its host must not contain `-pooler`. |
| `EXPECTED_DATABASE_NAME` | Required by production release; `tano_y_tasi_production` and checked as an exact database name. |
| `SECRET_KEY_BASE` | Rails production secret. |
| `WEB_APP_URL` | `https://tanoytasi.shimizu-technology.com`; CORS allowlist and payment return origin. |
| `FRONTEND_URL` | Same single web origin; email order links and Clerk `/admin/sign-up` redirect. Defaults to the first `WEB_APP_URL` origin. |
| `API_HOSTS` | `tano-y-tasi-api.onrender.com`; comma-separated host allowlist, no schemes/ports. |
| `PAYMENT_PROVIDER` | `stripe`; simulated payments are refused at production boot. |
| `STRIPE_SECRET_KEY` | Stripe secret key. |
| `STRIPE_WEBHOOK_SECRET` | Stripe signature verification secret. |
| `CLERK_PUBLISHABLE_KEY` | Clerk key used to derive the HTTPS issuer. |
| `CLERK_SECRET_KEY` | Clerk Backend API credential for identity lookup and invitations. |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated frontend origins; required for admin access, HTTPS in production. |
| `CLERK_JWKS_URL` | Optional HTTPS JWKS override, otherwise issuer + `/.well-known/jwks.json`. |
| `ADMIN_EMAILS` | Comma-separated bootstrap allowlist of verified primary emails. |
| `ADMIN_NOTIFICATION_EMAILS` | Optional comma-separated new-order recipients; absent uses active admins. An explicit empty value disables admin notices. |
| `RESEND_API_KEY` | Resend secret; required when email delivery is enabled. |
| `MAILER_FROM_EMAIL` | Explicit verified sender, e.g. `Tåno + Tåsi <orders@shimizu-technology.com>`. |
| `EMAIL_DELIVERY_ENABLED` | Explicit boolean; blueprint defaults to `false` and records `skipped` until enabled. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Secret IAM credentials for presigning product image uploads. The user only needs `s3:PutObject` on `products/*`. |
| `AWS_REGION`, `AWS_S3_BUCKET` | `ap-southeast-1`, `tano-y-tasi-media`. They also set which image URLs are accepted. Missing values return `503 storage_unavailable` on upload; boot is unaffected. |
| `RAILS_MAX_THREADS` | `3` on Render; local tests use 20 for concurrency coverage. |
| `FORCE_SSL` | `true` behind Render; `/up` is excluded from redirect. |
| `ASSUME_SSL` | `true` behind Render's TLS proxy. |
| `RAILS_ENV` | `production` (set by blueprint/image). |
| `PORT` | Supplied by Render (Puma defaults locally to 3031). |

Schedule `orders:release_expired` at the existing required cadence and `emails:retry_failed` for recovery; the blueprint does not provision a scheduler or worker. Deployment, real Clerk login/invitation delivery, real Resend delivery, and production observation are integration follow-through owned by the lead/operator; this worker does not deploy.

To verify the container locally: `docker build -t tyt-api-test api` from the repo root, then remove only that tag with `docker image rm tyt-api-test`.
