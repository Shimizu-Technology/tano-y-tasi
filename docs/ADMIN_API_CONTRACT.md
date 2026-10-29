# Admin API Contract — v1

Base path: `/api/v1/admin`. Every request needs `Authorization: Bearer <Clerk session JWT>`. JSON only. The error shape matches `API_CONTRACT.md`.

## Access model

- The admin is **invite-only**. Shoppers never sign in; checkout stays guest-only.
- The Clerk application runs in Restricted sign-up mode. People sign in with email (code or password) or Google.
- The Rails `users` table holds the role. Columns: `clerk_id` (unique), `email` (normalized), `name`, `role` (`admin` only for now), `active`, `last_signed_in_at`.
- **Provisioning on first request:** look up the user by `clerk_id`. If no row exists, fetch the user's **verified** primary email from the Clerk Backend API (`CLERK_SECRET_KEY`). Then create an admin if that email:
  1. appears in `ADMIN_EMAILS` (comma-separated env bootstrap list), or
  2. matches a pending `admin_invitations` row (marked accepted at that point).

  Otherwise the user is not provisioned and gets 403.
- **Status codes:**
  - `401 unauthenticated`: missing, invalid or expired token.
  - `403 forbidden`: a valid Clerk identity with no active admin row and no qualifying invitation or allowlist entry.
  - `503 identity_unavailable`: Clerk's Backend API is unreachable during provisioning (retryable).

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
  Summary fields: `number, token, status, fulfillment_status, email, total_cents, currency, item_count, created_at, paid_at`.
- `GET /orders/:number`: full detail. Includes items, the shipping address (from Stripe), `provider`, `provider_payment_intent_id`, `fulfillment_status` (`unfulfilled|fulfilled`), `tracking_number`, `tracking_url`, `fulfilled_at`, `notes`, and `email_deliveries[]` (`id, kind, to, status (pending|sent|failed), attempts, last_error, sent_at`).
- `PATCH /orders/:number`: `{ notes }`.
- `POST /orders/:number/fulfill`: `{ tracking_number?, tracking_url?, notify: true }` marks a paid order fulfilled. When `notify` is true, it sends the "shipped" email. Returns `422` unless the status is `paid`. Idempotent.
- `POST /orders/:number/unfulfill`: reverts the order to unfulfilled.
- `POST /orders/:number/email_deliveries/:id/resend`: re-sends that email and returns the updated delivery.

### Products
- `GET /products`: all statuses, with `stock_quantity` and `drop` summary.
- `GET /products/:slug`: editable fields: `name, summary, description, price_cents, status (draft|active|archived), position, specs{}, includes[], art{credit, story}, placeholders[]`, plus read-only `images[]`, `kind` and `drop`.
- `PATCH /products/:slug`: any editable field. Price changes never affect existing orders, which keep their snapshots.
- `POST /products/:slug/stock_adjustments`: `{ delta: integer (≠0), reason: string }`. Runs under a row lock through the inventory path, writes an inventory movement (`admin_adjustment`), and rejects any change that would take stock below 0 (`422 invalid_adjustment`). Returns the product.
- `GET /products/:slug/inventory_movements`: the latest 50.

(Creating products and uploading images is a later phase; it needs object storage. Products and images come from the seed for now.)

### Drops
- `GET /drops`, `GET /drops/:slug`: summary plus `product` (slug, name, stock_quantity) and its computed `state`.
- `PATCH /drops/:slug`: `{ name, release_at, closes_at, per_customer_limit, quantity }`.
  - `quantity` is the announced edition size. Changing it doesn't move stock; use stock adjustments for that.
  - Returns `422` if `release_at` would be after `closes_at`.

### Subscribers
- `GET /subscribers?page=`: `{ subscribers: [{ email, source, drop_slug, created_at }], page, pages, total }`
- `GET /subscribers.csv`: a CSV download.

### Admin users
- `GET /users`: active admins, plus `invitations[]` (pending).
- `POST /invitations`: `{ email }`. Creates an `admin_invitations` row and sends a **Clerk invitation** through the Backend API (`POST /v1/invitations` with `redirect_url` = `${FRONTEND_URL}/admin`), so the person can sign up in Restricted mode. Idempotent per email.
- `DELETE /invitations/:id`: revokes the invitation, in Clerk too.
- `PATCH /users/:id`: `{ active: false }` deactivates an admin. An admin can't deactivate themselves or the last active admin (`422`).

## Emails (Resend)

The `email_deliveries` table stores `order_id, kind (order_confirmation|admin_new_order|order_shipped), to, subject, status, attempts, last_error, provider_message_id, sent_at`.

- Sending happens **inline after commit**, never while inventory or order locks are held, through `EmailDelivery#deliver!`. It uses a Resend idempotency key of `"#{kind}-#{order.token}"`, plus the attempt number when an admin resends.
- A failure marks the delivery `failed`, logs it, and never fails the payment webhook. The rake task `emails:retry_failed` retries failures, up to 5 attempts.
- **Triggers:**
  - The transition to `paid` sends `order_confirmation` to the customer and `admin_new_order` to every active admin email (or `ADMIN_NOTIFICATION_EMAILS` if set).
  - `fulfill` with `notify` sends `order_shipped`.
- **Env vars:**
  - `RESEND_API_KEY`
  - `MAILER_FROM_EMAIL`, e.g. `Tåno + Tåsi <orders@shimizu-technology.com>`
  - `MAILER_REPLY_TO` (optional)
  - `EMAIL_DELIVERY_ENABLED` (explicit boolean; when false, deliveries are recorded as `skipped`)
- Templates are table-based HTML with inline styles that follow the brand: paper `#F5F0E7` background and ink `#141311` text, a text wordmark and no remote fonts. Each also has a plain-text part. The confirmation includes the order number, items, total and a link to `/orders/:token`.
