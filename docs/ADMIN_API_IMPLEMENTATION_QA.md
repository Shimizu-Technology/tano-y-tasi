# Admin API implementation and acceptance

2026-10-29; API worker; isolated `feature/admin-api`, starting at `3e6a65f` (contract), storefront base `614e609`. Scope: `api/`, deployment configuration, API workflow, and contracts. No web changes, deployment, real payments, invitations, or email sends.

## Sourced brief

The [product brief](PRODUCT_BRIEF.md) describes a guest-checkout Guam/Chamorro puzzle storefront with core stock and limited drops. The [public contract](API_CONTRACT.md) and [admin contract](ADMIN_API_CONTRACT.md) establish immutable paid snapshots, locked inventory movements, idempotent payments, invite-only operators, order fulfillment, catalog editing and subscribers. Existing payment transactions nest (`Payments::ProcessEvent` → `Payments::Complete` → `Orders::Inventory`); email must wait for the outermost commit. HafaPass supplies the Clerk/JWKS and Resend patterns. Existing seeds upsert catalog attributes and preserve existing stock and drop timing.

## Agent-executed acceptance plan

All fixtures are isolated synthetic test rows in `tano_y_tasi_test`. WebMock blocks all provider/network calls. Request specs exercise the Rails HTTP interface; service concurrency cases use real separate PostgreSQL connections. Nontransactional email cases verify actual commit boundaries. UI/device acceptance belongs to the admin web worker and integration lead; there are no UI changes in this worktree.

| Case | Starting fixture and actions | Required saved/observable outcome | State |
| --- | --- | --- | --- |
| A01 | Every endpoint: no token, valid shopper JWT, active admin JWT | 401/403/success; role/identity never taken from request body | passed |
| A02 | New identity: allowlist, pending/revoked invite, unverified primary, secondary email, Clerk outage/race | Only verified qualifying primary provisions; invitation accepted once; outages 503; inactive remains denied | passed |
| A03 | Locally signed RSA JWT and stubbed JWKS | Issuer/azp/expiry/nbf/signature enforced; one-hour cache; config fail-closed | passed |
| A04 | Paid/unpaid synthetic orders: search, notes, fulfill twice, unfulfill, resend | Saved notes/tracking; paid-only idempotent fulfillment; one shipped email; scoped resends | passed |
| A05 | Product/drop fixture: edit fields and stock, concurrent decrements, invalid timing | Immutable order snapshots; row locking, nonnegative stock, audit movements; quantity does not move stock | passed |
| A06 | Subscribers/admin fixtures: paged CSV, invite/revoke, deactivate | Page counts/export; correct stubbed Clerk calls; self/last admin guards | passed |
| A07 | Outside-fixture paid transitions and fulfillment, stubbed Resend success/failure/retry/disable | Send occurs after outer commit with no open transaction; failures do not fail completion; stable key/payload; resend key changes; cap five | passed |
| A08 | Docker build and guarded release/seeds | Multi-stage nonroot image builds; name/SSL/payment guards retained; rerun seeds preserves inventory/orders | passed |

Required engineering gates: RSpec, RuboCop, Brakeman, bundler-audit. Record final counts/results below after execution. Real Clerk/Resend delivery, Render deployment, production monitoring, and combined UI/mobile journeys are not run by this worker.

## Results (lead verification, 2026-10-29)

- RSpec: 246 examples, 0 failures, run against `tano_y_tasi_test`. RuboCop: 95 files, clean. Brakeman: no warnings. bundler-audit: no vulnerabilities.
- Docker: the multi-stage image builds. It boots with `RAILS_ENV=production` and the Stripe/DB guards, connecting to no database, and runs as uid 1000 (`rails`). The test image was removed afterwards.
- Not run here: real Clerk sign-in, real Resend delivery, the Render deploy, and the combined UI journeys. Those are covered by the integration and deployment QA.
