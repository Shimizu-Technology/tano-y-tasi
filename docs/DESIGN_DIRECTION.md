# Design Direction — Tåno + Tåsi Storefront

The goal is a quiet, premium shell with confident type and a lot of space. Christian's artwork supplies all the color. References: Supreme and Stüssy for restraint, Noah for the core-plus-drops structure, Aimé Leon Dore for typographic calm, Salvage Public and FITTED Hawaiʻi for specific island identity. Copy none of them.

## Principles

1. **Product first.** Every screen leads with artwork or the product. Copy is short.
2. **Restraint signals premium.** Few links, no badges or popups, no fake urgency, no discount banner.
3. **Show the evidence.** Piece count, size, what's included, credit and drop terms are always easy to find. Minimal never means vague.
4. **One system everywhere.** The same image ratios, the same type scale, and the same spacing on every page.
5. **Phones first.** Thumb-reachable primary actions, 44px minimum touch targets, no horizontal scroll, and fast image loading.

## Tokens

Define these as CSS variables or a Tailwind v4 `@theme`. Reference token roles, never raw hex values in components.

| Role | Value | Use |
|---|---|---|
| `--color-paper` | `#F5F0E7` | Page background (warm cream from the box) |
| `--color-paper-raised` | `#FBF8F2` | Drawer and sheet surfaces |
| `--color-ink` | `#141311` | Text, primary buttons |
| `--color-ink-muted` | `#5F5A53` | Secondary text (check AA contrast on paper) |
| `--color-line` | `#DDD5C8` | Hairlines and dividers |
| `--color-sun` | `#E8601C` | The **only** accent: live-drop indicator, focus ring, rare emphasis |
| `--color-sold` | `#8A847B` | Sold-out text and state |

Never use gradients, drop shadows on cards, or rounded "pill" cards. Corner radius is 0 everywhere except the focus ring offset.

## Typography

- Use one family: **Archivo** (variable, with width and weight axes), self-hosted via `@fontsource-variable/archivo`. Use the wide plus heavy settings for the wordmark and display moments, and normal width and weight for body. Verify that å, ñ and the ʻ/' glyphs render.
- Scale (mobile → desktop):
  - `label` 12px, uppercase, tracking 0.08em, weight 600: nav and information-bearing state labels.
  - `body` 16px, weight 400, line-height 1.5.
  - `title` 20/24px, weight 600: product names on product pages.
  - `display` clamp(40px, 9vw, 112px), wide width, weight 800, uppercase, tight leading 0.9: hero headline only.
- Buttons use 13px; `.small` is at least 13px. No storefront text is smaller than 12px. Prices use tabular numbers. Hero summaries use at least 18px in full ink.
- Email placeholders use `--color-ink-muted`, with the same readable contrast as secondary text.

## Layout

- Max content width 1440px. Gutters: 16px mobile, 24px tablet, 40px desktop.
- Spacing rhythm is on an 8px grid. Major section spacing is 96px mobile and 160px desktop.
- Product grid: **2 columns on mobile, 3 on desktop**. Square image tiles on `--color-paper` with no border; contain the artwork so landscape puzzles stay whole. A single-product feature uses the image's natural aspect ratio. Name and price sit below in `body`; the state label (`SOLD OUT`, `DROP 001`, `COMING DEC 5`) goes in `label` style.

## Header and navigation

- Height 56px, sticky, paper background with a hairline bottom border on scroll.
- Left: **wordmark** "TÅNO + TÅSI" as text, using the Archivo wide heavy settings. Build it as a single `<Wordmark/>` component so it can be swapped for the logo image if Christian picks the rounded logo.
- Desktop: center or right inline links `SHOP · DROP · STORY · ARCHIVE` in `label` style, then `CART (0)`.
- Mobile: `MENU` text button on the left of the cart, opening a full-screen paper sheet with large stacked links. Plain text, no hamburger icon.
- When a drop is live, show a small `--color-sun` dot beside `DROP`. That is the only animated hint (a subtle pulse, disabled under reduced motion).

## Pages

### Home
1. **Hero** led by the drop's state:
   - Drop upcoming or live: drop artwork (map), display headline `GUÅHAN`, the product summary from the API, then `Drop 001 · Releases Sat, Dec 5 · 10:00 AM ChST` or `Drop 001 · Available now · 100 made` using the API's date and quantity. Primary action: `NOTIFY ME` / `SHOP THE DROP`.
   - No active drop: the Tumon puzzle tabletop photo with display headline `A PIECE OF HOME.` and `SHOP`.
   - A secondary text link names the first available core puzzle and its price from the API, with a Lucide arrow.
   - Mobile: full-width 4:5 art, then caption. Desktop ≥900px: art occupies about 60% of the hero at near viewport height, with a bottom-aligned caption beside it. No decorative kicker or vertical side label.
2. **The core collection:** a real 24–32px h2, plus `Shop all` and the product collection. A single featured puzzle shows its available specs instead of a repeated collection label.
3. **Story strip:** h2 `Tåno is land. Tåsi is sea.`, the brand paragraph at a narrow measure (~36ch), and `Our story` with a Lucide arrow. At ≥900px, an unequal-size composition of the ko'ko', Two Lovers Point and Humåtak map details fills the other half. Mobile stays one column with the ko'ko' detail.
4. **Signup:** h2 `New drops, first.`, with an email field and `SIGN UP`. Separate it with space, without a top rule or decorative kicker.
5. **Footer:** a raised-paper tone step, the small rounded logo emblem, real links to Shipping and FAQ, "Made for Guåhan and everyone carrying it with them," and © year. No decorative top or inner rules. Contact remains a route but is not linked until contact details are supplied.

### Shop
Title `Shop` with a muted `1 puzzle` / `N puzzles` count on the baseline, then the core collection grid. If a drop is live, show one wide card at the top linking to it.

### Drop (`/drop` → current or next drop; `/drops/:slug` for any)
- **Upcoming:** large artwork, `DROP 001 — GUÅHAN SUNSET MAP`, the release time in **ChST**, plus PT and HT on a second line, quantity ("100 made"), limit ("Limit 2 per customer"), price, a detail gallery, and the drop-alert form. The add-to-cart button is disabled and reads `RELEASES DEC 5`. A countdown is optional and must only show inside the final 48 hours.
- **Live:** same layout; the button becomes `ADD TO CART`, and the state line shows "Available now" with the sun dot. Show a remaining count only when 20 or fewer are left ("Only 12 left"), and only from real data.
- **Sold out:** artwork stays; the button is disabled `SOLD OUT`; a line reads "Drop 001 sold out on Dec 5." plus a drop-alert form for the next drop.
- **Closed:** like sold out, with the reason "This drop has closed."

### Product detail
- Mobile: a horizontally swipeable gallery (CSS scroll-snap) with an `1 / 5` counter and `SWIPE TO EXPLORE` only when there are multiple images on mobile, then the info block, then a full-width sticky-bottom `ADD TO CART` bar once the main button scrolls out of view.
- Desktop: two columns. The gallery on the left (about 60%) has a large lead image, then a two-column grid of the remaining images at their natural aspects; the info column on the right is sticky.
- Info order: drop state label when applicable (core context is already in the breadcrumb), name (`title`), price, one-sentence description, quantity stepper (bounded by the drop limit and available stock), primary button, then accordions: **Details** (piece count, finished size, box size, material, cut, made in), **What's in the box**, **The art** (credit + story), **Shipping** ("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico."). Hide unknown spec rows (`TBD` or `To be confirmed`) and omit internal preview notes.
- Images open in a full-screen viewer with pinch/zoom on mobile. The map is high resolution, so let people inspect it.

### Story
Alternating image/text sections: the large logo emblem with the brand paragraph; the meaning of *tåno* and *tåsi* with map details; the upright, flat puzzle photo with "We start with puzzles of Guåhan…" and the collection CTA. One h1, no decorative kicker or unapproved founder placeholder. Keep it to one calm page; mobile uses a single column.

### Archive
A grid of past drops (sold out or closed) with date and quantity. When the archive is empty, preview the next upcoming drop as the first entry: artwork, name, drop number, "Upcoming", release date/time in ChST and a link to the drop. Take the entry from the API; if a drop is already live, preview it as "Available now". If none is announced, show "No past drops yet."

### Cart drawer
Opens from the right on desktop (420px) and as a full-height sheet on mobile. It shows line items (thumbnail, name, price, stepper, remove), a subtotal, the note "Shipping calculated at checkout," and a `CHECKOUT` button. Checkout asks for an email (prefilled if previously entered) before hand-off. Errors from the API (sold out, limit, drop not live) appear inline on the affected line, in plain language, with a fix ("Reduce to 2", "Remove").

### Checkout states
- While the request runs, the button is disabled and reads "Reserving your order…". Prevent double submit.
- Hand-off goes to Stripe or the simulated payment page.
- **Confirmation** (`/orders/:token`): "Thank you" headline, order number, items, total, and status. If the order is still pending, poll politely: visibility-aware, stopping on paid, expired or canceled, with a cap.
- **Cancelled/expired:** a calm message, with the cart restored and a way back.

### Information pages
Shipping states the checkout calculation and supported destinations (United States, Guam and Puerto Rico). FAQ covers the release time in ChST/PT/HT, per-customer limit from data, no drop restocks, supported destinations, and the roughly 30-minute checkout hold. Do not publish unconfirmed policies.

## Loading and icons

Route loading states reserve the hero aspect ratio, collection tiles, or product columns with flat tone blocks and accessible status text. No shimmer. The main region keeps the footer below the viewport during loading. Use Lucide SVG icons at 16px and stroke width 1.5 for arrows, quantity controls and accordion markers; hide decorative icons from assistive technology.

## Motion

Subtle and fast: image fade-in on load (150ms), drawer and sheet enter (220ms) and faster exit (160ms), progressive native accordion height, and 140ms press feedback. Drawers use `cubic-bezier(0.32, 0.72, 0, 1)`; other motion uses `cubic-bezier(0.23, 1, 0.32, 1)`. Keep overlays interruptible and retain focus and scroll lock until exit finishes. Phone carts dismiss with a rightward swipe; artwork inspection uses anchored transform zoom up to 4×.

The home caption enters once per session with 50ms staggers and at most 8px of movement; adding items briefly ticks the cart count. Reduced motion retains short opacity and colour fades, removes decorative transforms and the live pulse, and keeps explicit image zoom usable. No parallax, scroll-jacking or Lenis.

## Imagery

Use the files in `web/public/images/products/*` and `web/public/images/brand/*`. Use `srcset` and `sizes` with lazy loading below the fold and `fetchpriority="high"` on the hero. Always set width and height or an aspect ratio to avoid layout shift. Alt text describes the artwork, for example "Puzzle of the colorful GUAM letter sign on the sand at Tumon Bay."

The core Tumon puzzle leads with `finished-flat` (12:7), followed by `piece-detail` and `finished-tabletop`. Keep the portrait tabletop scene for the no-drop home hero and its edge preload. The square/landscape duplicate crops and misprinted box-front stay on disk but are omitted from the catalog gallery. Cart thumbnails contain the full artwork.

## Copy voice

Plain, warm and brief. Chamorro words appear naturally (Håfa Adai, Guåhan). Avoid hype words ("insane", "fire"), exclamation marks, and invented scarcity.

## Accessibility and performance

WCAG AA contrast, visible focus (2px `--color-sun` outline, 2px offset), and semantic landmarks. Drawers and sheets trap focus and close on Esc. Form errors are tied to inputs. Target LCP under 2.5s on mid-range mobile: preload the hero image and font, and use no heavy animation libraries.
