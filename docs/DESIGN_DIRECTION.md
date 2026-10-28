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
  - `label` 11/12px, uppercase, tracking 0.08em, weight 600: nav, eyebrow, state labels.
  - `body` 15/16px, weight 400, line-height 1.5.
  - `title` 20/24px, weight 600: product names on product pages.
  - `display` clamp(40px, 9vw, 112px), wide width, weight 800, uppercase, tight leading 0.9: hero headline only.
- Prices use tabular numbers. Never set essential details smaller than 13px.

## Layout

- Max content width 1440px. Gutters: 16px mobile, 24px tablet, 40px desktop.
- Spacing rhythm is on an 8px grid. Major section spacing is 96px mobile and 160px desktop.
- Product grid: **2 columns on mobile, 3 on desktop**. Square image tiles on `--color-paper` with no border. Name and price sit below in `body`; the state label (`SOLD OUT`, `DROP 001`, `COMING DEC 5`) goes in `label` style.

## Header and navigation

- Height 56px, sticky, paper background with a hairline bottom border on scroll.
- Left: **wordmark** "TÅNO + TÅSI" as text, using the Archivo wide heavy settings. Build it as a single `<Wordmark/>` component so it can be swapped for the logo image if Christian picks the rounded logo.
- Desktop: center or right inline links `SHOP · DROP · STORY · ARCHIVE` in `label` style, then `CART (0)`.
- Mobile: `MENU` text button on the left of the cart, opening a full-screen paper sheet with large stacked links. Plain text, no hamburger icon.
- When a drop is live, show a small `--color-sun` dot beside `DROP`. That is the only animated hint (a subtle pulse, disabled under reduced motion).

## Pages

### Home
1. **Hero (full-bleed)** led by the drop's state:
   - Drop upcoming or live: Drop artwork (map), eyebrow `DROP 001`, display headline `GUÅHAN`, one line ("Releases Sat, Dec 5 · 10:00 AM ChST" or "Available now · 100 made"), and one action (`NOTIFY ME` / `SHOP THE DROP`).
   - No active drop: the Tumon puzzle tabletop photo with display headline `A PIECE OF HOME.` and `SHOP`.
   - Mobile uses a tall crop (4:5); desktop uses landscape (16:9 to 3:2) with text bottom-left on a legible area. No dark overlays heavier than a soft bottom scrim.
2. **The Collection:** label `CORE COLLECTION`, then the grid.
3. **Story strip:** the brand paragraph in `title` size at a narrow measure (~36ch), centered or left-aligned, with `OUR STORY →`. Generous space.
4. **Drop alerts:** one line ("New drops, first. No spam.") with an email field and `SIGN UP`.
5. **Footer:** the rounded logo emblem (small), links (Shipping & Returns placeholder, FAQ placeholder, Wholesale "coming soon", Contact, Instagram/TikTok placeholders), and "Made for Guåhan and everyone carrying it with them." plus © year.

### Shop
Title `SHOP` with a small count, then the core collection grid. If a drop is live, show one wide card at the top linking to it.

### Drop (`/drop` → current or next drop; `/drops/:slug` for any)
- **Upcoming:** large artwork, `DROP 001 — GUÅHAN SUNSET MAP`, the release time in **ChST**, plus PT and HT on a second line, quantity ("100 made"), limit ("Limit 2 per customer"), price, a detail gallery, and the drop-alert form. The add-to-cart button is disabled and reads `RELEASES DEC 5`. A countdown is optional and must only show inside the final 48 hours.
- **Live:** same layout; the button becomes `ADD TO CART`, and the state line shows "Available now" with the sun dot. Show a remaining count only when 20 or fewer are left ("Only 12 left"), and only from real data.
- **Sold out:** artwork stays; the button is disabled `SOLD OUT`; a line reads "Drop 001 sold out on Dec 5." plus a drop-alert form for the next drop.
- **Closed:** like sold out, with the reason "This drop has closed."

### Product detail
- Mobile: a horizontally swipeable gallery (CSS scroll-snap) with an `1 / 5` counter, then the info block, then a full-width sticky-bottom `ADD TO CART` bar once the main button scrolls out of view.
- Desktop: two columns. The images stack on the left (about 60%); the info column on the right is sticky.
- Info order: state label, name (`title`), price, one-sentence description, quantity stepper (bounded by the drop limit and available stock), primary button, then accordions: **Details** (piece count, finished size, box size, material, cut, made in), **What's in the box**, **The art** (credit + story), **Shipping** (placeholder copy marked as such).
- Images open in a full-screen viewer with pinch/zoom on mobile. The map is high resolution, so let people inspect it.

### Story
Large logo emblem, the brand paragraph, a short section on the meaning of *tåno* and *tåsi*, a tabletop photo, and a line about Christian as founder (placeholder copy until he approves). Keep it to one calm page.

### Archive
A grid of past drops (sold out or closed) with date and quantity. Empty state: "The first drop releases Dec 5." with a link to the drop.

### Cart drawer
Opens from the right on desktop (420px) and as a full-height sheet on mobile. It shows line items (thumbnail, name, price, stepper, remove), a subtotal, the note "Shipping calculated at checkout," and a `CHECKOUT` button. Checkout asks for an email (prefilled if previously entered) before hand-off. Errors from the API (sold out, limit, drop not live) appear inline on the affected line, in plain language, with a fix ("Reduce to 2", "Remove").

### Checkout states
- While the request runs, the button is disabled and reads "Reserving your order…". Prevent double submit.
- Hand-off goes to Stripe or the simulated payment page.
- **Confirmation** (`/orders/:token`): "Thank you" headline, order number, items, total, and status. If the order is still pending, poll politely: visibility-aware, stopping on paid, expired or canceled, with a cap.
- **Cancelled/expired:** a calm message, with the cart restored and a way back.

## Motion

Subtle and fast: image fade-in on load (150ms), drawer and sheet slide (220ms ease-out), accordion height, and button state. No parallax, scroll-jacking or Lenis. Everything respects `prefers-reduced-motion`.

## Imagery

Use the files in `web/public/images/products/*` and `web/public/images/brand/*`. Use `srcset` and `sizes` with lazy loading below the fold and `fetchpriority="high"` on the hero. Always set width and height or an aspect ratio to avoid layout shift. Alt text describes the artwork, for example "Puzzle of the colorful GUAM letter sign on the sand at Tumon Bay."

## Copy voice

Plain, warm and brief. Chamorro words appear naturally (Håfa Adai, Guåhan). Avoid hype words ("insane", "fire"), exclamation marks, and invented scarcity.

## Accessibility and performance

WCAG AA contrast, visible focus (2px `--color-sun` outline, 2px offset), and semantic landmarks. Drawers and sheets trap focus and close on Esc. Form errors are tied to inputs. Target LCP under 2.5s on mid-range mobile: preload the hero image and font, and use no heavy animation libraries.
