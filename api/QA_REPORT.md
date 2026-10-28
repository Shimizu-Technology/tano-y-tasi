# API foundation — implementation and QA record

Date: 2026-10-29 (ChST). Owner/executor: API implementation worker.
Worktree: `tano-y-tasi-worktrees/api-foundation`; branch: `feature/api-foundation`.
Base: `main` at `0a2d197`. Tested implementation commit: `48a4a1303e8778c8d4bddda728188c5349ed9454`; the following commit adds the specifications, CI workflow, README, and this record. All reported gates ran against that complete working tree.

## Context and acceptance

Sources: `docs/PRODUCT_BRIEF.md`, binding `docs/API_CONTRACT.md`, repository `AGENTS.md`, and Brain-Dump's `starter-app/order-processing-reliability-guide.md`. The product sells core puzzles and one-time drops to Guam shoppers and the diaspora. API acceptance covers catalog/drop states, atomic checkout, email-based drop limits, idempotent payment and release, late payments, and subscriber signup. Browser/device acceptance belongs to the web worker and integration lead.

Rails 8.1.4 was generated with all requested flags; all were recognized. `--skip-bundle` was added so the requested dependencies could be configured before installation. Runtime verification used Ruby 3.3.4 and local PostgreSQL 16.11. Only `tano_y_tasi_development` and `tano_y_tasi_test` were created or modified. Runner checks confirmed their names before database tasks.

## Delivered

- Products, drops, orders, immutable item snapshots, payment events, subscribers, and inventory-movement audit records, with database constraints and unique payment/idempotency identifiers.
- Every v1 endpoint: storefront, product list/detail, drop list/detail, checkout, order read/cancel, signed Stripe webhooks, simulated payment complete/cancel, subscribers, and Rails `/up`.
- Deterministic product locking, 30-minute reservations, per-key advisory serialization, provider calls outside inventory transactions, compensation on session failure, bounded expiry cleanup with five-minute grace, and idempotent stock release.
- Shared completion service with late-payment re-reservation or `needs_attention`, shipping snapshots, and final sold-out timestamps.
- Production provider/env guards, exact-origin CORS, checkout/subscriber throttles including equivalent route variants, structured errors, and bearer-token path redaction in request logs.
- Idempotent catalog seeds using all 26 supplied image derivatives, commercial placeholder labels, development drop-state task, cron expiry task, setup/environment notes, and Postgres-backed GitHub CI.

`docs/API_CONTRACT.md` was not changed. Additive behavior: Stripe async-payment success uses the same completion service; product lists include `server_time`; simulated actions return the public order shape. Failed session setup keeps returning `503 payment_unavailable` on retries of that failed key; a fresh checkout needs a fresh key.

## Automated gates

- `bundle exec rspec`: **93 examples, 0 failures**.
- `bundle exec rubocop`: **62 files, no offenses**.
- `bundle exec brakeman --no-pager --quiet`: **0 errors, 0 security warnings**.
- `bundle exec bundler-audit check --update`: **no vulnerabilities**; advisory DB commit `3df20d31748fbafd1f6c75ade50e5d1d266257ee`.
- `git diff --cached --check`: passed after removing an extra generated SQL EOF newline.

Six concurrency scenarios use separate real PostgreSQL connections without transactional fixtures: twelve buyers racing for five units (five orders, seven sold-out errors, final stock zero), twelve identical keys (one order/decrement), concurrent per-customer limits, duplicate cancellation, cancel/completion races, and proof that another connection can lock inventory during provider session creation. Cleanup deletes only each example's fixture rows.

The suite covers every endpoint and documented error code, event signatures and duplicates, rollback, cross-order limits, expiry/grace/batching, late-payment recovery and shortage, snapshots, database constraints, production boot, CORS, throttles, and seed paths. WebMock blocks external network calls. Initial fixture/signature issues and later Stripe-object access and throttle-variant findings were fixed and retested; final results above supersede those failures.

## Agent-executed HTTP smoke

Environment: development database, simulated provider, `127.0.0.1:3031`. Curl requests verified persisted outcomes. Nine cases passed: boot health, storefront, checkout/retry/payment/order read, double cancellation, subscriber retry, and the four drop states. No failed required API smoke cases remain. Representative curl output (tokens omitted):

```text
GET /api/v1/storefront -> 200
{"featured_drop":"upcoming","core_products":["hafa-adai-from-tumon-bay"],"server_time":"2026-10-28T22:58:23Z"}

POST /api/v1/checkout -> 201
{"order":{"number":"TYT-100001","status":"pending_payment","expires_at":"2026-10-28T23:28:23Z"},"payment_url":"http://localhost:5181/checkout/simulated/<token>"}
Identical checkout retry -> 200, same order and payment_url
POST /api/v1/simulated_payments/<token>/complete -> 200 paid (twice)
GET /api/v1/orders/<token> -> 200
{"order":{"number":"TYT-100001","status":"paid","email_masked":"a•••@example.com","subtotal_cents":3500,"total_cents":3500,"currency":"USD","paid_at":"2026-10-28T22:58:23Z"}}

Separate two-unit order: cancel twice -> 200 canceled
POST /api/v1/subscribers -> 201 {"subscribed":true}, then 200 {"subscribed":true}
```

The displayed JSON is a projection of the actual bodies, preserving the key observed fields. Database evidence after payment and cancellation:

```json
{"stock":49,"movements":[[-1,49,"reserve"],[-2,47,"reserve"],[2,49,"release"]]}
```

The paid unit remained allocated once. The other two units were restored once. Drop-state HTTP checks returned upcoming/non-purchasable/max 0, live/available/max 2, sold_out/remaining 0/max 0, and closed/non-purchasable/max 0. The drop was restored to `2026-12-05T00:00:00Z`, stock 100, no close/sold-out timestamp. Local core stock remains 49 with the simulated paid order, plus a canceled order and QA subscriber. No pending QA holds remain.

## Lead follow-up and limits

**Real Stripe rollout blocker:** the binding requirement sets expiry to reservation time plus exactly 30 minutes and passes it unchanged to Stripe. [Stripe requires 30 minutes or more after session creation](https://docs.stripe.com/api/checkout/sessions/create#creating_checkout_session-expires_at). Reservation/network latency can put that timestamp below Stripe's minimum. Resolve an expiry buffer with the shared contract before real-key integration testing; this worker preserved the specified timing. Rejection safely returns 503 and releases the reservation.

No real Stripe keys, provider network calls, browser/mobile journeys, deployment, external reviewer, PR, or merge were used. GitHub CI is configured but its hosted run is not claimed as verified. Delayed payments can need human refunds after inventory release; staff that process before enabling delayed methods. Throttles are process-local; use an edge/global limit for multiple app processes. Production still needs its env values, signed webhook subscription (including async success if enabled), and an every-minute `orders:release_expired` cron. Fulfillment email, refunds, taxes/shipping, admin, and sending alerts remain outside this phase.

## Resource disposition

The initial background server PID `35744` exited before serving; its lifecycle records were cleared. Smoke server PID `37242` was validated, stopped with SIGTERM, and released in both lifecycle sessions (`01a184b1-1492-7513-a55f-6138917152b2` and `db0f0ba3-e316-4410-bf82-d05b447f7412`). Both report no active owned resources; port 3031 has no listener. No browser/device/container was started. Shared services were left running. The worktree is retained for integration; no PR was opened.

## Review fixes — 2026-10-29

This section supersedes the earlier session-failure, expiry-buffer, contract, and verification notes above. Starting head: `63c97719b95a7d1f88d5f798a9eea12ca440bc2c`, open PR #1 into `main`. Verification ran against the complete changed working tree on `feature/api-foundation`; the worker report identifies the resulting pushed commit. Sources remain the repository instructions, product brief, API contract, current services, and reliability guide. The local Brain-Dump search found no additional Tåno + Tåsi project notes.

Scope: agent-executed affected-flow API QA for stock reservations, limited drops, payment retry/recovery, session closure, and boot safety. Fixtures are isolated test products/orders with transaction rollback, or explicitly deleted concurrency fixtures. WebMock blocks external network calls; Stripe responses and failures are simulated. Only `tano_y_tasi_development` and `tano_y_tasi_test` were migrated after runner checks confirmed each exact name. No server, browser, device, or container was started.

Required acceptance and evidence:

- R1 passed: an expired pending hold still counts throughout grace; legacy overlapping holds cannot complete into four fulfilled units; released and canceled late payments recheck the limit; pending violations restore all item reservations once. Paid `needs_attention` orders continue counting. Both event orders and a twelve-connection completion race are covered by `payment_limits_spec.rb` and `concurrency_spec.rb`. When the old payment needs attention first, its paid quantity also blocks fulfilling the replacement until refunds are reconciled.
- R2 passed: connection errors, API errors, rate limits, timeouts, and interrupted IO preserve the reservation and return retryable 503 responses. Identical retries recover the same order with identical Stripe parameters. Invalid-request and idempotency errors release once and instruct the client to start a new checkout. A crash after Stripe returns but before session persistence replays unchanged expiry and saved line items even after catalog edits. Expired failed holds release normally. Evidence: `session_recovery_spec.rb`, plus the existing checkout and gateway specs.
- R3 passed: injected expiration failure followed by a second cancel succeeds without a second stock release. Already-expired orders also retry; already-expired/complete Stripe sessions are confirmed by retrieval. The rake task closes newly expired holds and retries prior releases, bounded to 100 closures per run. Signed expiry webhooks persist closure after cancellation; async failure preserves retry work when Stripe is unavailable. Provider closure holds no inventory transaction or row lock. Evidence: `session_closure_spec.rb`, `webhooks_spec.rb`, and `concurrency_spec.rb`.
- R4 passed: production uses Rails' resolved database name and requires an exact `EXPECTED_DATABASE_NAME` when configured, otherwise the `tano_y_tasi` prefix. Missing/mismatched names reject boot. A subprocess invoking the real `db:migrate` task with the test database name, an unreachable socket, and a mismatched allowlist was rejected by the initializer before connection or migration. A runner verified `tano_y_tasi_test` before that rejection test. No other database was contacted. Evidence: `boot_spec.rb`.

Final gates:

- `bundle exec rspec`: 129 examples, 0 failures (including 8 real-Postgres concurrency scenarios).
- `bundle exec rubocop`: 68 files, 0 offenses.
- `bundle exec brakeman --no-pager --quiet`: 0 errors, 0 security warnings.
- `bundle exec bundler-audit check --update`: no vulnerabilities; 1,284 advisories, database commit `3df20d31748fbafd1f6c75ade50e5d1d266257ee`.
- `git diff --check`: passed.

The first run had two incorrect expectations that a replacement would fulfill after the old payment was already marked paid/needs-attention. The required paid-attention counting rule blocks that fulfillment too. Those expectations were corrected and the full suite passed; no required API scenario remains failed or blocked.

`docs/API_CONTRACT.md` now documents grace-period/paid-attention limits, completion enforcement, saved Stripe expiry, transient versus definitive 503 recovery, and cancellation closure retries. The public JSON shape is unchanged. `api/.env.example` and `api/README.md` document the production allowlist and recovery operations. Migration `20261029000002` adds the session expiry/closure timestamps and an index for outstanding closure work.

Limits: real Stripe transport, browser/mobile usability, hosted CI at the pushed head, independent review of these fixes, deployment, and merge are not part of this worker's execution. No GitHub comment or merge was performed. Resource status: no task-owned resources were started or left running; shared Postgres and other baseline services remain untouched. The named worktree is retained for the parent review.
