# API Contract — v1

Base: `/api/v1`. JSON only. Money is integer cents with `currency: "USD"`. Times are ISO 8601 in UTC; the client formats them for ChST/PT/HT. The web app reads `VITE_API_URL` (default `http://localhost:3031`).

Errors always use this shape:

```json
{ "error": { "code": "sold_out", "message": "Guåhan Sunset Map just sold out.", "details": { "product_slug": "guahan-sunset-map", "available": 0 } } }
```

Status codes: `400` malformed, `404` not found, `409` idempotency conflict, `422` business-rule violation, `429` rate limited, `503` dependency (payment provider) unavailable.

## Shared shapes

### Image
```json
{ "role": "hero", "alt": "…", "base": "/images/products/guahan-sunset-map/artwork", "widths": [640, 1280, 2000, 2800], "aspect": "509:640" }
```
The client builds `srcset` from `${base}-${w}.webp`. Roles are `hero`, `gallery`, `detail`, `box`, `lifestyle`. Order is meaningful.

### Product (list item)
```json
{
  "slug": "hafa-adai-from-tumon-bay",
  "name": "Håfa Adai from Tumon Bay",
  "kind": "core",
  "price_cents": 3500,
  "currency": "USD",
  "summary": "The GUAM sign at Tumon Bay, 100 pieces.",
  "specs": { "piece_count": 100, "finished_size": "12 × 9 in" },
  "availability": { "state": "available", "purchasable": true, "remaining": null, "low_stock": false },
  "drop": null,
  "image": { "role": "hero", "...": "..." },
  "alt_image": { "role": "detail", "...": "..." }
}
```
`alt_image` is the second item in the product’s ordered images, or `null` when absent. It uses the same Art shape as `image` and is additive on all public product summaries (storefront, lists, nested drops) and detail responses. Clients may load it on demand for a second view; the primary `image` is unchanged.

Summary `specs` contains `piece_count` and `finished_size` when set, across storefront, product lists, and nested drop products. Detail responses include the full specs object.

`availability.state` is one of `available`, `sold_out`, `upcoming` (drop not released), `closed`. `remaining` is returned **only** when `low_stock` is true (20 or fewer left) or the product is sold out (0); otherwise it is null. `drop` is a drop summary (below) for drop products.

### Product (detail) — list fields plus:
```json
{
  "description": "…",
  "specs": { "piece_count": 100, "finished_size": "12 × 9 in", "box_size": "TBD", "material": "TBD", "cut": "Classic", "made_in": "USA" },
  "includes": ["100-piece puzzle", "Keepsake box"],
  "art": { "credit": "Photo: Christian Tenorio (to confirm)", "story": "…" },
  "per_customer_limit": null,
  "max_per_order": 10,
  "images": [ { "role": "hero", "...": "..." } ],
  "placeholders": ["price_cents", "specs.box_size"]
}
```
`max_per_order` = min(per_customer_limit or 10, purchasable stock). `placeholders` lists fields that are not yet confirmed; the UI may show a subtle "details to be confirmed" note in the Details accordion.

### Drop summary
```json
{
  "slug": "drop-001-guahan-sunset-map",
  "number": 1,
  "name": "Guåhan Sunset Map",
  "state": "upcoming",
  "release_at": "2026-12-05T00:00:00Z",
  "closes_at": null,
  "sold_out_at": null,
  "quantity": 100,
  "per_customer_limit": 2
}
```
Drop `state` is `upcoming`, `live`, `sold_out` or `closed`. It is derived server-side from `release_at`, `closes_at`, and stock (counting active reservations). `release_at` is `null` for a drop that is coming soon: its state is `upcoming`, it is not purchasable, and clients show "Coming soon" instead of a date. `quantity` is `null` until the merchant confirms it (while `drop.quantity` is in the product's placeholders).

## Endpoints

### `GET /api/v1/storefront`
Home page payload in one request:
```json
{ "featured_drop": { "...drop summary...", "product": { "...product list item..." } }, "core_products": [ "…" ], "server_time": "2026-10-29T00:00:00Z" }
```
`featured_drop` is the live drop, else the next dated upcoming drop, else the first coming-soon drop, else null. `server_time` lets the client correct clock skew for countdowns.

### `GET /api/v1/products?kind=core|drop`
`{ "products": [ … ] }`. Excludes drafts.

### `GET /api/v1/products/:slug`
`{ "product": { …detail… }, "server_time": "…" }`

### `GET /api/v1/drops`
`{ "current": drop|null, "upcoming": [drop…], "archive": [drop…], "server_time": "…" }`. Each drop includes `product` (list item). The archive holds sold-out or closed drops, newest first.

### `GET /api/v1/drops/:slug`
`{ "drop": { …summary…, "product": { …detail… } }, "server_time": "…" }`

### `POST /api/v1/checkout`
Starts checkout: validates, **reserves stock atomically**, creates a pending order, and returns a payment URL.

Request:
```json
{ "email": "a@b.com", "idempotency_key": "uuid-v4-from-client", "items": [ { "product_slug": "guahan-sunset-map", "quantity": 2 } ] }
```
Response `201`:
```json
{ "order": { "token": "opaque", "number": "TYT-100001", "status": "pending_payment", "expires_at": "…" }, "payment_url": "https://checkout.stripe.com/… or http://localhost:5181/checkout/simulated/<token>" }
```
- The same `idempotency_key` with an identical payload returns the same order (`200`) and does **not** reserve again. The same key with a different payload returns `409 idempotency_conflict`.
- `422` codes: `sold_out`, `insufficient_stock` (details.available), `drop_not_live` (details.release_at, null when coming soon), `limit_exceeded` (details.product_slug, details.limit, details.already_purchased), `invalid_email`, `empty_cart`, `unknown_product`, `quantity_invalid`.
- The per-customer limit treats Gmail dot variants and `+tags` as one customer, and counts quantities across that customer's `paid`, all `pending_payment` (including the grace period), and already-paid `needs_attention` orders for that drop product (case-insensitive email). Payment completion rechecks the limit. A payment that would exceed it becomes `needs_attention`, requires a refund, and releases any stock it still holds exactly once.
- Stripe holds last 31 minutes, with the session expiry saved before the provider request; simulated holds last 30 minutes. Retries reuse the saved expiry and item snapshots. Holds are released 5 minutes after expiry, as a grace period for in-flight payments.
- `503 payment_unavailable` always includes `details.retry`. `"same_key"` means a transient provider failure preserved the hold: retry the **same payload and idempotency key**, even if fresh availability shows no stock (this attempt may hold the last unit). `"new_checkout"` means definitive rejection released the reservation, or the unsessioned hold has ended: clear the saved attempt and **start a new checkout** with a fresh key. Expired holds are cleaned up normally.
- Error details: `sold_out` / `insufficient_stock` include `{ product_slug, available }`; `drop_not_live` includes `{ product_slug, release_at }`; `limit_exceeded` includes `{ product_slug, limit, already_purchased }`. Validation (`invalid_email`, `empty_cart`, `unknown_product`, `quantity_invalid`, `malformed`), `idempotency_conflict`, and `rate_limited` use `{}`. Clients should preserve a general recovery message when an older response omits a product slug.

### `GET /api/v1/orders/:token`
```json
{ "order": { "token": "…", "number": "TYT-100001", "status": "paid", "email_masked": "a•••@b.com", "items": [ { "product_slug": "…", "name": "…", "quantity": 2, "unit_price_cents": 4500, "image": { … } } ], "subtotal_cents": 9000, "total_cents": 9000, "refunded_cents": 0, "currency": "USD", "created_at": "…", "paid_at": "…", "expires_at": "…" } }
```
Order `status` is `pending_payment`, `paid`, `expired`, `canceled`, `refunded` or `needs_attention`. The token is a long random value (unguessable); it is the only way to read an order publicly.

### `POST /api/v1/orders/:token/cancel`
The customer abandons checkout from the cancel page. If the order is `pending_payment`, the stock is released and the status becomes `canceled`. The call is idempotent and returns the order. For canceled or expired Stripe orders, every call retries closing an unconfirmed session. Closure failures leave persistent retry work for later cancels or the scheduled expiry task; stock is restored only once. A late payment still passes the stock and customer-limit checks and may require a refund.

### `POST /api/v1/webhooks/stripe`
Verifies the `Stripe-Signature` header; a bad signature is the only `400`. Every signed event gets a 2xx and is idempotent by Stripe event id.

- `checkout.session.completed` / `async_payment_succeeded`: marks paid and records the payment intent. A charged amount or session that doesn't match the order becomes `needs_attention` with `attention_reason`, releases any held stock, and alerts admins.
- `checkout.session.expired`: releases stock and marks expired. `checkout.session.async_payment_failed`: releases stock and marks canceled.
- `charge.refunded`: records the absolute `amount_refunded`. A full refund marks the order `refunded` and restocks it if it hasn't shipped. A partial refund keeps the status.
- `charge.dispute.created|updated|closed`: records `dispute_status`; a new dispute alerts admins.
- Sessions and payments that aren't ours are acknowledged and ignored.

### Simulated provider (development/test only)
Enabled only when `PAYMENT_PROVIDER=simulated` **and** `Rails.env` is development or test. Booting production with the simulated provider must raise.
- `POST /api/v1/simulated_payments/:token/complete` runs the same code path as `checkout.session.completed`.
- `POST /api/v1/simulated_payments/:token/cancel` follows the same path as expiry or cancel.
These return `404` when the simulated provider is not active.

### `POST /api/v1/subscribers`
`{ "email": "a@b.com", "source": "home|drop|product|footer", "drop_slug": "optional" }` returns `201` (new) or `200` (already subscribed), with body `{ "subscribed": true }`. `422 invalid_email`. Rate limited per IP.

### `GET /up`
Boot-only health check (Rails default). No dependency checks here.
