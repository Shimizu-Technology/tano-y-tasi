# Admin API Contract — v1

Base path: `/api/v1/admin`. Every request needs `Authorization: Bearer <Clerk session JWT>`. JSON except the subscribers CSV export. The error shape matches `API_CONTRACT.md`.

## Access model

- The admin is **invite-only**. Shoppers never sign in; checkout stays guest-only.
- The Clerk application runs in Restricted sign-up mode. People sign in with email (code or password) or Google.
- The Rails `users` table holds the role. Columns: `clerk_id` (unique), `email` (normalized and unique), `name`, `role` (`admin` only for now), `active`, `last_signed_in_at`.
- **Provisioning on first request:** look up the user by `clerk_id`. If no row exists, fetch the user's **verified** primary email from the Clerk Backend API (`CLERK_SECRET_KEY`). Then create an admin if that email:
  1. appears in `ADMIN_EMAILS` (comma-separated env bootstrap list), or
  2. matches a pending `admin_invitations` row (marked accepted at that point).

  Otherwise the user is not provisioned and gets 403.
- Provisioning is serialized with invitation revocation by normalized email. An existing inactive user with the verified email remains forbidden even under a new Clerk ID. An active user with that email and a different Clerk ID is also forbidden and logged; changing the Clerk identity requires a separate explicit relinking operation.
- **Status codes:**
  - `401 unauthenticated`: missing, invalid or expired token.
  - `403 forbidden`: a valid Clerk identity with no active admin row and no qualifying invitation or allowlist entry.
  - `503 identity_unavailable`: Clerk/JWKS is unavailable, identity lookup fails, or required Clerk configuration is missing/invalid (retryable). Configuration is checked only on admin access; storefront boot still succeeds.

## Endpoints

### `GET /api/v1/admin/me`
`{ "user": { "id", "email", "name", "role": "admin" } }`. The web app calls this before rendering any admin screen.

### Dashboard: `GET /api/v1/admin/dashboard`
```json
{ "orders": { "paid_count": 12, "paid_total_cents": 46000, "unfulfilled_count": 3, "needs_attention_count": 0 },
  "recent_orders": [ { "...order summary..." } ],
  "featured_drop": { "...drop summary incl. product stock_quantity..." } | null,
  "low_stock": [ { "slug", "name", "stock_quantity" } ],
  "subscribers_count": 40 }
```

### Orders
- `GET /orders?status=&fulfillment=&q=&page=`: paginated at 25 per page. `q` matches the order number or email.
  Response: `{ "orders": [summary], "page": 1, "pages": 3, "total": 61 }`.
  Summary fields: `number, token, status, fulfillment_status, email, total_cents, currency, item_count, preorder_item_count, created_at, paid_at`. `preorder_item_count` is the units on preorder lines, so the list can flag them.
- `GET /orders/:number`: full detail. Includes items (each with its `preorder_ships` snapshot, or `null`), the shipping address (from Stripe), `provider`, `provider_payment_intent_id`, `fulfillment_status` (`unfulfilled|fulfilled`), `tracking_number`, `tracking_url`, `fulfilled_at`, `notes`, and `email_deliveries[]` (`id, kind, to, status (pending|sent|failed|skipped), attempts, last_error, sent_at`).
- `PATCH /orders/:number`: `{ notes }`.
- `POST /orders/:number/fulfill`: `{ tracking_number?, tracking_url?, notify: true }` marks a paid order fulfilled. When `notify` is true, it sends the "shipped" email. Returns `422` unless the status is `paid`. Idempotent. It covers the whole order: a cart that mixed preorder and in-stock items has one fulfillment, for now, so the merchant marks it once everything has shipped. The admin warns before fulfilling an order with preorder lines.
- `POST /orders/:number/unfulfill`: reverts the order to unfulfilled.
- `POST /orders/:number/email_deliveries/:id/resend`: re-sends that email and returns the updated delivery.
- `POST /orders/:number/refund` with `{ "refund_key": "uuid", "amount_cents": 1000 }`. `amount_cents` defaults to the remaining balance. `refund_key` is required and identifies one attempt: repeating it after an unclear response never starts another refund, even if the webhook already closed the request, so keep it across retries and replace it after a clear result. The request is saved before Stripe is called, so retrying an unconfirmed refund reuses its key and can't pay twice. It stays open until the order reflects the refund, so no new refund can start before then; the webhook also closes it. The balance is what the customer was actually charged (`charged_cents`, or the order total). A full refund of an unshipped order restocks it. `422 invalid_refund`, `refund_rejected`, or `refund_in_progress` (a different amount while one is unconfirmed; `open_refund_cents` shows it); `503 payment_unavailable` (retry the same amount); `409 busy` if another refund is running.
- `POST /orders/:number/mark_paid`: for a `needs_attention` order the merchant will ship anyway. Takes unshipped items from stock, clears `attention_reason`, and sends the confirmation. `422 invalid_order_state` or `insufficient_stock`.
- Order detail also returns `attention_reason`, `charged_cents`, `refunded_cents`, `open_refund_cents`, `refunded_at` and `dispute_status`.

### Store settings
- `GET /store`, `PATCH /store`: `{ sales_open, contact_email, tagline, secondary_tagline, story, mission_lines[] }`. `sales_open` is the master switch for every purchase.

### Pages
- `GET /pages`, `GET /pages/:slug`, `PATCH /pages/:slug`: `{ title, body }` for `shipping`, `returns`, `privacy` and `terms`. `{{contact_email}}` in a body renders as the current contact email.

### Products
- `GET /products`: all statuses, with `stock_quantity` and `drop` summary.
- `GET /products/:slug`: editable fields: `name, summary, description, price_cents, status (draft|active|archived), position, signature, per_customer_limit, preorder, preorder_ships, specs{}, includes[], art{credit, story}, placeholders[], images[]`, plus `kind` and `drop`.
- `POST /products` (201): `name, summary, description, price_cents` are required; `status` defaults to `draft`, `position` to last, `kind` to `core`. Also accepts `signature, per_customer_limit, preorder, preorder_ships, specs, includes, art, placeholders` and `kind`/`drop_slug`. The slug comes from the name (`Håfa Adai Mañana` becomes `hafa-adai-manana`), takes a numeric suffix on a collision, never changes on rename, and is never `new`. Stock starts at 0 and only changes through stock adjustments. `slug`, `stock_quantity` and `currency` are ignored. There is no delete endpoint.
- `PATCH /products/:slug`: any editable field. Price changes never affect existing orders, which keep their snapshots. `slug`, `stock_quantity` and `currency` are ignored.
  - **How it sells:** `signature` and `preorder` must be JSON `true` or `false`. `per_customer_limit` is a positive whole number, or `null` to follow the drop's limit (core products then have none). `preorder: true` needs `preorder_ships` (up to 120 characters), or `422 invalid_record` with `details.preorder_ships`; the database enforces this too. Editing `preorder_ships` never changes existing orders.
  - **Placement:** `kind` and `drop_slug` move a product either way. `{ kind: "core" }` (with `drop_slug` absent or null) moves it to the always-available collection; `{ kind: "drop", drop_slug }`, or `drop_slug` alone, moves it into a drop. A drop can hold several products. `422 invalid_record` with `details.drop_slug` for an unknown drop or a missing or contradictory slug; `details.kind` for any other kind. A drop left without a product disappears from public pages. Moving a product, or changing its status or images, refreshes `sold_out_at` on the drops involved. Stock, orders and customer-limit history stay with the product. A checkout already open when its product moves into an unreleased drop becomes `needs_attention` (`drop_withdrawn`) if paid.
  - **Images:** `images` replaces the ordered list. Each needs `role` (`hero|gallery|detail|box|lifestyle`), nonblank `alt`, `aspect` like `4:3`, `widths` (nonempty positive JSON integers), and `base`: a safe path under `/images/` or a URL under `https://<AWS_S3_BUCKET>.s3.<AWS_REGION>.amazonaws.com/products/`. Nothing else is accepted: no `..`, empty segments, queries or spaces. Unknown keys are dropped. A value that isn't a list of objects is `422`, never an empty list. `[]` is allowed and hides the product. Rules apply only when `images` changes, so saved data can't block stock changes or checkout. Replaced files stay in the bucket.
- `POST /products/:slug/stock_adjustments`: `{ delta: integer (≠0), reason: string }`. Runs under a row lock through the inventory path, writes an inventory movement (`admin_adjustment`), and rejects any change that would take stock below 0 (`422 invalid_adjustment`). Returns the product.
- `GET /products/:slug/inventory_movements`: the latest 50.

### Production runs
Orders placed with the factory. Admin only: unit costs and suppliers never appear in a public payload.

Shape: `{ id, quantity, status (ordered|received|canceled), supplier, unit_cost_cents, expected_at (YYYY-MM-DD), received_at, stock_added, notes, created_at, updated_at }`.

- `GET /products/:slug/production_runs`: `{ production_runs: [...] }`, newest first.
- `POST /products/:slug/production_runs` (201): `quantity` (required, above 0), `supplier`, `unit_cost_cents`, `expected_at`, `notes`. Doesn't change stock. Returns `{ production_run }`.
- `PATCH /products/:slug/production_runs/:id`: the same fields. `quantity` can't change once a run is received. An unreadable `expected_at` is `422`, never a cleared date. `status`, `received_at` and `stock_added` are ignored. Returns `{ production_run, product }`.
- `POST /products/:slug/production_runs/:id/receive`: `{ stock_added? }`, a JSON whole number from 0 to the run's quantity, defaulting to the quantity. Use less than the quantity when fewer arrived, or 0 when the units were already allotted as preorders. Under the product's row lock, it writes one inventory movement (`production_received`, with `production_run_id`) and records `stock_added` and `received_at` on the run. A count of 0 writes no movement, since the ledger holds only real changes, and the run itself is the record. Idempotent: receiving again returns the run unchanged, even with a different count, and a unique index allows only one movement per run. Returns `{ production_run, product }`. `422 invalid_production_run` for a canceled run or a bad count (`details.stock_added`).
- `POST /products/:slug/production_runs/:id/cancel`: idempotent, and doesn't change stock. `422 invalid_production_run` for a received run; use a stock adjustment instead. Returns `{ production_run, product }`.

### Image uploads
`POST /uploads` with `{ "product_slug": "…", "widths": [640, 1280, 2000], "content_type": "image/webp" }` returns (201):
```json
{ "base": "https://<bucket>.s3.<region>.amazonaws.com/products/<slug>/<random>",
  "uploads": [ { "width": 640, "url": "<presigned PUT>", "headers": { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } } ] }
```
- One presigned PUT per width, for the object `products/<slug>/<random>-<width>.webp`, valid for 15 minutes. Both headers are signed: the browser must send them exactly as returned, so the bucket's CORS rules must allow them. Then save `base` and the widths through `PATCH /products/:slug` `images`.
- Only `image/webp`, 1 to 6 different widths, each from 100 to 4000. `422 invalid_upload` with `details.content_type` or `details.widths`; `404` for an unknown product; `503 storage_unavailable` when any `AWS_*` setting is missing. Boot doesn't need them. File size isn't limited by the URL.
- The admin resizes in the browser with canvas at each default width no larger than the source (always at least one) and rejects sources under 640px wide. Where canvas can't encode WebP, as in Safari on iPhone, a WASM encoder is downloaded on demand, which is why the site's `script-src` has `'wasm-unsafe-eval'`.

### Drops
- `GET /drops`, `GET /drops/:slug`: summary plus `product` (the first by position: slug, name, stock_quantity, status, or null), `products` (all of them, in position order, including drafts) and its computed `state`. A drop with no product is never `live`, and isn't featured on the dashboard. Attach products through `PATCH /products/:slug`.
- `POST /drops` (201): `name` is required. `release_at`, `closes_at`, `per_customer_limit` (default 2) and `quantity` (default 0, meaning undecided) are optional. `number` is the highest existing number plus one, and the slug is `drop-NNN-<name>`; the unique indexes settle a race and the request retries. A new drop has no product and stays off public pages until one is attached.
- `PATCH /drops/:slug`: `{ name, release_at, closes_at, per_customer_limit, quantity }`. `per_customer_limit` applies to each product in the drop that doesn't set its own. A `null` `release_at` makes the drop coming soon. Admin responses always include the real `quantity`.
  - `quantity` is the announced edition size. Changing it doesn't move stock; use stock adjustments for that.
  - Returns `422` if `release_at` would be after `closes_at`, or if either isn't a readable date and time. An unreadable date never turns a drop into coming soon.

### Subscribers
- `GET /subscribers?page=`: `{ subscribers: [{ email, source, drop_slug, created_at }], page, pages, total }`
- `GET /subscribers.csv`: a CSV download.

### Admin users
- `GET /users`: active admins, plus `invitations[]` (pending).
- `POST /invitations`: `{ email }`. Creates an `admin_invitations` row and sends a **Clerk invitation** through the Backend API (`POST /v1/invitations` with `redirect_url` = `${FRONTEND_URL}/admin/sign-up`), with `ignore_existing: true`, so the person can sign up in Restricted mode. Idempotent per pending email. Returns `{ "invitation": { id, email, created_at, accepted_at, revoked_at } }` (201); revoke returns the same envelope (200). Provider failure returns `503 identity_unavailable` and does not create a qualifying local invitation.
- `DELETE /invitations/:id`: records the local revocation first, serialized with provisioning by normalized email, then revokes the Clerk invitation outside the database lock. If Clerk is unavailable, the local invitation stays revoked and the endpoint returns retryable `503 identity_unavailable`; repeating the delete retries the provider revocation.
- `PATCH /users/:id`: `{ active: false }` deactivates an admin. An admin can't deactivate themselves or the last active admin (`422`).

## Emails (Resend)

The `email_deliveries` table stores `order_id, kind (order_confirmation|admin_new_order|order_shipped), to, subject, status, attempts, last_error, provider_message_id, sent_at`.

- Sending happens **inline after commit**, never while inventory or order locks are held, through `EmailDelivery#deliver!`. It uses a Resend idempotency key of `"#{kind}-#{order.token}"`, plus a persistent resend generation (the next attempt number) when an admin resends. `admin_new_order` appends a recipient digest to the base key so notices to different admins cannot collide. Automatic retries keep the original generation and saved payload; an explicit resend captures a fresh payload.
- A failure marks the delivery `failed`, logs it, and never fails the payment webhook. The rake task `emails:retry_failed` retries failed and pending deliveries with fewer than 5 attempts. Pending recovery covers a crash after commit. Successful automatic retries are not re-sent.
- **Triggers:**
  - The transition to `paid` sends `order_confirmation` to the customer and `admin_new_order` to every active admin email (or `ADMIN_NOTIFICATION_EMAILS` if set).
  - `fulfill` with `notify` sends `order_shipped`.
- **Env vars:**
  - `RESEND_API_KEY`
  - `MAILER_FROM_EMAIL`, e.g. `Tåno + Tåsi <orders@shimizu-technology.com>`
  - `MAILER_REPLY_TO` (optional)
  - `EMAIL_DELIVERY_ENABLED` (explicit boolean; when false, deliveries are recorded as `skipped`)
- Templates are table-based HTML with inline styles that follow the brand: paper `#F5F0E7` background and ink `#141311` text, a text wordmark and no remote fonts. Each also has a plain-text part. The confirmation includes the order number, items, total and a link to `/orders/:token`. A preorder line also carries its ship text, except in the shipped email.


## Response and validation clarifications

- `GET /me` and user list/update responses include `active` and `last_signed_in_at` in addition to the user fields above. User update returns `{ user }`; user list is `{ users, invitations }`.
- Product responses use `{ product }` and lists `{ products }`; drop responses use `{ drop }` and lists `{ drops }`. Product lists include the editable fields, read-only images/kind, `currency`, `stock_quantity`, and drop summary.
- Dashboard recent orders are the latest 10; low stock is 20 units or fewer. Order and subscriber pages have 25 entries, stable newest-first ordering, and zero pages when empty.
- Order detail includes `subtotal_cents` and `shipping` (the persisted Stripe shipping address payload), along with the fields above. Fulfill/unfulfill/notes return `{ order }`; resend returns `{ email_delivery }`. Fulfill is a no-op once fulfilled, including notify/tracking; to change the fulfillment cycle, unfulfill first. One shipped delivery row is retained per order; send again through the explicit resend endpoint if needed.
- Inventory response is `{ inventory_movements: [{ id, delta, balance, reason, note, order_id, production_run_id, created_at }] }`, latest 50 first. For admin changes, `reason` is `admin_adjustment`, `note` preserves the supplied human reason, and `order_id` is null. Receiving a run writes `reason: production_received`, `note: "Production run <id>"` and `production_run_id`. Stock adjustments require a JSON integer, nonzero delta, and a nonblank reason; strings/floats are rejected with `422 invalid_adjustment`.
- Model validation returns `422 invalid_record`, with `details` mapping each field to its messages (`{ "name": ["can't be blank"] }`); fulfillment rules use `invalid_fulfillment`, user guards use `invalid_user`, and accepted invitation revocation uses `invalid_invitation`. Errors retain the standard `{ error: { code, message, details } }` shape. Tracking URLs accept only HTTP(S). Non-editable fields are ignored through strong params.
- Subscriber CSV headers are `email,source,drop_slug,created_at`; formula-like values are escaped with a leading apostrophe for spreadsheet safety.
- Clerk `azp` may be absent as in the reference verifier; when present it must match `CLERK_AUTHORIZED_PARTIES`. `iss`, `sub`, and `exp` are required; RS256 signature, issuer, expiry, and not-before are checked. JWT verification selects the usable RS256 signing key matching `kid`; malformed or unusable JWKS responses return 503 and are not cached. The JWKS cache lasts one hour, with one single-flight unknown-`kid` refresh at most once per minute for rotation. Only verified primary email from the Backend API qualifies for provisioning.
- Delivery status `sent` means Resend accepted the message. It does not assert inbox arrival. Provider errors never fail payment completion; automatic retry retains a stable idempotency key within Resend's retention window. Uncertain older outcomes require operator reconciliation.
