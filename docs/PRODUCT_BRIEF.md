# Tåno + Tåsi — Product Brief

Last updated: 2026-11-04 · Owner: Leon Shimizu (tech) with Christian Tenorio (founder: product, marketing, sales)

## What this is

Tåno y Tåsi ("Tåno + Tåsi — Island Supply Co.") is a Guam/Chamorro lifestyle brand. It starts with premium jigsaw puzzles of Guåhan, then adds novelty items (custom board games) and other islands. Tagline: **A Piece of Home.** A secondary line, "Grounded by land, guided by sea.", is used in the story section.

Brand story (Christian's words; use sparingly, never above every buy button):

> Land and sea define our islands, but our culture extends beyond their shores. Tåno y Tåsi exists to keep us connected to where we come from, carrying a piece of home wherever we are.

*Tåno* = land, *tåsi* = sea. Always keep the Chamorro diacritics (å, ñ, ') in display text.

## Business model

- **Manufacturing:** Christian manufactures in China, with a minimum of 500 units per design, ordered about 60 days ahead. The specifics aren't decided, so the merchant sets them in the admin: nothing below is hardcoded.
- **Core collection:** always-available puzzles, restocked when they sell out. A **signature** product, probably the GUAM map, sorts first and carries a quiet label. Several are allowed.
- **Drops:** one-time, limited-quantity releases at an announced date and time, monthly or quarterly. A drop can hold several products. **Drops do not restock.** When every product in a drop is gone or the drop closes, it moves to the Archive and stays visible.
- **Limits:** any product can have a per-customer limit. Otherwise it follows its drop's limit, and core products have none. A limit counts all of a customer's orders for that product.
- **Preorders:** a product can sell before it arrives, with the units the merchant allots and free text saying when it ships. The order keeps the ship text it was sold with. A cart can mix preorder and in-stock items, as one order with one fulfillment for now.
- **Production runs:** each factory order is recorded on its product, with its quantity, supplier, cost per unit and expected date. Receiving a run adds its stock once.
- Later (not in this proof of concept): wholesale to ABC Stores, Guam mall/airport shops, ABC Hawaii; TikTok Shop; Amazon.

## Audience

- Chamorro diaspora on the US mainland and Hawaii buying "a piece of home," often as gifts.
- Locals on Guam, and visitors buying a premium souvenir.
- Most arrive on a phone from TikTok or Instagram. **Mobile is the primary design target; desktop must feel equally deliberate.**

## Experience goal

Christian chose "Look 2" from five previews: retro and a little modern, simple, clean, and feeling like the island, with the mission statement front and center. Tone references are Ordinary Habit and Salem Goods. See `DESIGN_DIRECTION.md`. The product art supplies the color; the site gets out of the way. Christian also plans to sell novelty goods and apparel beyond CHamoru puzzles, so navigation and collection language stays neutral.

## Proof-of-concept scope (this phase)

In scope:
1. Storefront pages: Home, Shop (core), Drop (current/next), Product detail, Story, Archive, Cart drawer, Checkout hand-off, Order confirmation, 404.
2. Drop lifecycle states rendered from data: **upcoming** (preview, not purchasable), **live**, **sold out**, **closed**.
3. Real checkout flow with inventory reserved at checkout start, so drops **never oversell** and payments **never duplicate orders**.
4. Payment provider abstraction: Stripe Checkout (test mode once keys exist) and an explicit **simulated** provider for local development/QA. The simulated provider must be impossible to enable in production.
5. Drop-alert email signup (stored; no sending yet).
6. Seed data built from Christian's real artwork (two products, one drop).

Out of scope for now (planned next): merchant admin for Christian (Clerk auth), transactional email, shipping rates/labels, taxes, wholesale, channel sync, analytics.

## Seed catalog (placeholder commercial values — confirm with Christian)

| Product | Type | Price | Details |
|---|---|---|---|
| Håfa Adai from Tumon Bay | Core | $35 (placeholder) | 100 pieces, 12 × 9 in finished. Photo of the GUAM sign at Tumon Bay |
| Guåhan Sunset Map | Drop 001 | $45 (placeholder) | Illustrated village and landmark map; piece count/size TBD (use 500 pieces, 16 × 20 in as a labeled placeholder). Quantity: 100 (placeholder). Limit 2 per customer |

Drop 001 release: **Saturday, December 5, 2026, 10:00 AM ChST** (placeholder; = Friday Dec 4, 4:00 PM PST / 2:00 PM HST).

Guam is ChST, UTC+10, with no daylight saving time. Always show Guam time first, then Pacific and Hawaii.

## Decisions on record

- Custom build (Rails API + React), not Shopify, chosen by Leon on 2026-10-29 for full customization.
- Merchant of record for payments will be Christian (US mainland). Stripe does not support Guam-based accounts.
- Drops are one-time only.
- Shipping/fulfillment and unit economics are deferred for the proof of concept.

## Room for sizes later (not built)

Apparel will need sizes. Variants aren't built, and nothing here should assume them yet. They would slot in like this:

- A `product_variants` table belongs to a product: `sku` (unique), `options` (such as `{ "size": "M" }`), `stock_quantity`, an optional `price_cents` that overrides the product's, and `position`. Every existing product would get one default variant, so one code path serves both.
- Stock moves to the variant. Row locks, `reserve` and `release`, inventory movements and production runs would all refer to a variant, in place of a product.
- `order_items` gain a `product_variant_id` and a snapshot of the SKU and option labels, alongside the existing name and price snapshots. Older rows keep working with it null.
- A purchase limit stays on the product, across its variants. The API adds `variants` to product detail and takes `variant_sku` in a cart line. Preorder settings stay on the product at first.

## Open questions (do not block the build)

- Final domain: shoptanoytasi.com vs tanoytasi.com.
- Wordmark: decided. The header uses Christian's distressed "TÅNO + TÅSI · Island Supply Co" wordmark image and the rounded brown/green/teal logo is the emblem (home hero, Story, footer). Revisit only if Christian asks.
- Rights confirmation for the GUAM sign photo and the map illustration's source.
- Real prices, quantities, piece counts and sizes for the map puzzle.
- Which product is the signature puzzle, how often drops run, what limits apply, and how a cart mixing preorder and in-stock items should ship.

## Acceptance for this phase

The storefront is accepted when, on a 390×844 phone viewport and a 1440×900 desktop viewport:

1. A visitor understands within the first screen what the brand sells and how to shop it.
2. Home → product → add to cart → cart drawer → checkout → (simulated) payment → confirmation works, and the order shows as paid with stock reduced exactly once.
3. Cancelling or abandoning checkout releases the reserved stock after the hold expires.
4. With the drop **upcoming**, its product is viewable but cannot be added to the cart; the release time shows in ChST, PT and HT.
5. With the drop **live**, a customer cannot buy more than the per-customer limit, and concurrent checkouts for the last units never oversell. This is proven by an automated test against real Postgres.
6. With the drop **sold out**, it stays visible and is clearly marked; core products remain easy to find.
7. Drop-alert signup accepts a valid email, is idempotent, and rejects invalid input with a helpful message.
8. Keyboard navigation, visible focus, alt text, reduced motion and readable contrast all work; no horizontal scroll on mobile.
