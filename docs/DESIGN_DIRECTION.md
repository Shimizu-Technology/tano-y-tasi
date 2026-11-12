# Design Direction — Tåno + Tåsi Storefront

Retro and a little modern, simple, and unmistakably the island. That was Christian's brief, and he picked this look ("Look 2") from five previews. A warm sand page, brown ink, the rounded Tåno Tåsi logo, and a slow green strip of the mission. The mission leads. Product artwork supplies the loud colors; the shell stays quiet. Tone references are Ordinary Habit and Salem Goods: studied for feel, copied for nothing.

## Principles

1. **Mission first, then product.** The first screen says what the brand is for ("A piece of home.", "Keeping us connected to where we come from.") and shows real artwork. The brand is expected to sell more than puzzles, so navigation and collection framing use neutral words (`Shop`, `collection`, `items`); only product data says "puzzle".
2. **Restraint signals premium.** Few links, no badges or popups, no gradients, no fake urgency, no discount banner.
3. **Show the evidence.** Piece count, size, what's included, credit and drop terms are easy to find. Minimal never means vague.
4. **One system everywhere.** The same tokens, image ratios and type scale on every page.
5. **Phones first.** Thumb-reachable primary actions, 44px minimum touch targets, no horizontal scroll, fast image loading. Verify at 390×844 and 1440×900.

## Tokens

Defined in the `@theme` block of `web/src/styles.css`. Reference token roles, never raw hex values in components.

| Role | Value | Use |
|---|---|---|
| `--color-paper` | `#E5DFD2` | Page background (warm sand). Also the `theme-color` in `index.html`. |
| `--color-paper-raised` | `#F2EDE3` | Drawer, sheet and input surfaces |
| `--color-paper-deep` | `#D9D0BF` | Footer band |
| `--color-tile` | `#DBD3C3` | Ground behind contained artwork (product tiles, drop art) |
| `--color-ink` | `#491E0B` | Text, primary buttons (the logo's brown) |
| `--color-ink-muted` | `#61594D` | Secondary text and placeholders |
| `--color-line` | `#BCB3A3` | Hairlines and dividers |
| `--color-green` | `#14492B` | Mission strip, focus ring, the tagline in the story section |
| `--color-teal` | `#0E495B` | Reserved for the logo's sea; not used for UI yet |
| `--color-cream` | `#FDEFD5` | Text and icons on the green strip |
| `--color-sun` | `#ED601B` | The logo's sun: live-drop dot, the sun in the hill mark |
| `--color-sold` | `#8A847B` | Disabled and sold-out states |

No gradients, no card shadows, no pill cards. Corner radius is 0 everywhere.

## Typography

- One family: **Archivo** (variable, with width and weight axes), self-hosted via `@fontsource-variable/archivo`. Headlines are heavy (800) with tight tracking (`-0.03em` to `-0.045em`); body is 400. There is no serif. Verify that å, ñ and the ʻ/' glyphs render.
- Scale (mobile → desktop):
  - `home h1` clamp(30px, 9vw, 44px) → clamp(44px, 3.9vw, 56px), weight 800, leading 1.05.
  - section `h2` 32px → 48px (home drop and story), 24px → 32px (collection, signup).
  - `title` 20px → 24px, weight 600: product names.
  - `label` 12px, uppercase, tracking 0.08em, weight 600: nav, state labels.
  - `body` 16px, weight 400, line-height 1.5. Mission line 18px → 20px.
- Buttons use 13px. No storefront text is smaller than 12px. Prices use tabular numbers. Email placeholders use `--color-ink-muted`.

## Layout

- Max content width 1440px. Gutters: 16px mobile, 24px tablet, 40px desktop.
- Spacing rhythm is on an 8px grid. Home sections use 64px of vertical padding on phones and 112px on desktop.
- Product grid: 2 columns on mobile, 3 on desktop. A single-product collection is a feature: contained artwork on `--color-tile` beside its name, price, summary and a `VIEW DETAILS` button.

## Header and navigation

- Height 56px, sticky, paper background with a hairline on scroll.
- Left: the distressed **wordmark** image ("TÅNO + TÅSI · Island Supply Co", ink color, 360/720px WebP served at 132–136px), rendered by `<Wordmark/>`.
- Desktop: `SHOP · DROP · STORY · ARCHIVE` in `label` style, then `CART (0)`. Mobile: a `MENU` text button beside the cart, opening a full-screen paper sheet with 40px stacked links and the sign-off `GUÅHAN · MARIANA ISLANDS` / `A PIECE OF HOME.`
- When a drop is live, a small `--color-sun` dot sits beside `DROP`. It pulses slowly and is static under reduced motion.

## Home

All home copy comes from `web/src/brand.ts` (tagline, mission lines, story paragraph, secondary tagline) so an admin setting can supply it later.

1. **Hero.** The rounded logo emblem, `A piece of home.` as the h1, the first mission line, then the tabletop puzzle photo, a one-line description of the first buyable product (from the API, omitted if there is none), and the actions. The hero never depends on a drop or a particular product: it is the same in every drop state, and the edge preload (`web/netlify/lib/storefront.ts`) names the same image and `sizes` (`web/src/homeHero.ts`).
   - Primary action: `SHOP THE COLLECTION`. A secondary text link appears only for a drop that is live (`SHOP THE DROP`) or upcoming (`NOTIFY ME`, jumping to the alert form below).
   - Mobile (390×844): copy, then a 5:4 photo, then actions, so the mission and the photo are both on the first screen. Desktop ≥900px: two columns, copy and actions left, a square photo right, all inside 900px of height.
2. **Mission strip.** A green band with the tagline and both mission lines separated by sun-and-hill marks, moving slowly (55s loop). A 44px pause/play button controls it (WCAG 2.2.2). With reduced motion the lines sit still, once, wrapped and centred, with no duplicated copy and no button.
3. **The core collection.** `h2`, `Shop all`, then the product collection.
4. **The drop**, when the API features one. Art on `--color-tile`, `DROP 001`, the drop name and summary:
   - *Coming soon* (`release_at` null): `DROP 001 · COMING SOON`, "The release date goes to the list first.", no date, quantity or price, and the alert form (`NOTIFY ME`) is the action. A text link goes to the drop page.
   - *Upcoming with a date*: the price, `Drop 001 · Releases Sat, Dec 5 · 10:00 AM ChST · 100 made` (quantity only when known), the alert form.
   - *Live*: `Drop 001 · Available now`, the price and `VIEW THE DROP`.
   - *Sold out / closed*: the status line and `VIEW THE DROP`.
   - *No drop*: the section is omitted.
5. **Story.** A map detail, the sun-and-hill mark, `Tåno is land. Tåsi is sea.`, the brand paragraph at ~36ch, the secondary tagline "Grounded by land, guided by sea." in green label type, and `Our story`.
6. **Signup.** `New drops, first.` with an email field and `SIGN UP`. When the drop is upcoming or coming soon, its section carries the form instead, so the page never shows two.
7. **Footer.** A full-width `--color-paper-deep` band with the small rounded logo (served at 240/480/960px WebP, not the full-size original), "Made for Guåhan and everyone carrying it with them," links to Shipping and FAQ, and © year. Contact stays a route but is not linked until contact details are supplied.

### The box that turns
A product with box art shows its box in place of the flat image: on product cards, on the single-product feature, and as the first slide of the product gallery. The box is folded from four flat images (front, back and two sides) with CSS 3D transforms, with no 3D library, and rests turned 24° so a side shows. It sits on `--color-tile` with room around it to swing.

- **Mouse:** it turns slowly (one turn in six seconds) while the pointer is over it and comes back to rest on leaving. Dragging turns it by hand.
- **Touch:** a sideways drag turns it and it rests on the nearer of front or back; an up-and-down drag still scrolls the page, and a drag never opens the product. The first time a touch screen shows a box it makes one small turn and returns, so it reads as something to turn.
- **Product gallery:** a swipe there moves the gallery, so a `SHOW THE BACK` / `SHOW THE FRONT` button under the box turns it. The button also serves keyboards.
- **Reduced motion:** no hover spin and no hint. Dragging and the button still work, without the settle animation.
- A product without box art keeps its flat image. The merchant adds the faces in the admin image manager ("Box that turns: front", and so on). Until Christian supplies real box art, the two launch puzzles use stand-in faces drawn by `web/scripts/build-box-placeholders.mjs`.

### Shop
A signature product comes first and reads `SIGNATURE · 100 PIECES` in the same quiet label under its card. It's a word, not a badge. Title `Shop` with a muted `1 item` / `N items` count on the baseline, then the core collection grid. If a drop is live, show one wide card at the top linking to it.

### Drop (`/drop` → current or next drop; `/drops/:slug` for any)
- **Upcoming:** large artwork, `DROP 001 — GUÅHAN SUNSET MAP`, the release time in **ChST**, plus PT and HT on a second line, quantity ("100 made"), limit ("Limit 2 per customer"), price, a detail gallery, and the drop-alert form. The add-to-cart button is disabled and reads `RELEASES DEC 5`. A countdown is optional and must only show inside the final 48 hours.
- **Live:** same layout; the button becomes `ADD TO CART`, and the state line shows "Available now" with the sun dot. Show a remaining count only when 20 or fewer are left ("Only 12 left"), and only from real data.
- **Sold out:** artwork stays; the button is disabled `SOLD OUT`; a line reads "Drop 001 sold out on Dec 5." plus a drop-alert form for the next drop.
- **Closed:** like sold out, with the reason "This drop has closed."
- **Several products:** one product keeps the page above. With more, the page is the drop's own: breadcrumb, state label, the drop name as a 32px → 48px heading, its timing and facts, then the collection grid linking to each product. Each product's page carries its own buy button and limit. Home shows the lead's art, `2 items in this drop.` and one price or `From $45`.

### Product detail
- Mobile: a horizontally swipeable gallery (CSS scroll-snap) with an `1 / 5` counter and `SWIPE TO EXPLORE` only when there are multiple images on mobile, then the info block, then a full-width sticky-bottom `ADD TO CART` bar once the main button scrolls out of view.
- Desktop: two columns. The gallery on the left (about 60%) has a large lead image, then a two-column grid of the remaining images at their natural aspects; the info column on the right is sticky.
- Info order: drop state label when applicable (core context is already in the breadcrumb), name (`title`), price, one-sentence description, quantity stepper (bounded by the drop limit and available stock), primary button, then accordions: **Details** (piece count, finished size, box size, material, cut, made in), **What's in the box**, **The art** (credit + story), **Shipping** ("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico."). Hide unknown spec rows (`TBD` or `To be confirmed`) and omit internal preview notes.
- Images open in a full-screen viewer with pinch/zoom on mobile. The map is high resolution, so let people inspect it.

### Preorders
The buy button reads `PREORDER`. `Preorder.` in green, then the merchant's ship text, sits above the buy button, on the cart line, on the payment page and on the order line. It's dropped once the product has sold out or closed. A cart mixing preorder and in-stock items adds one plain note: "This cart includes a preorder, so your whole order may ship together when the preorder is ready." No countdowns or urgency.

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

Route loading states reserve the hero grid (emblem, headline and photo at their real sizes), collection tiles, or product columns with flat tone blocks and accessible status text. No shimmer. The main region keeps the footer below the viewport during loading. Use Lucide SVG icons at 16px and stroke width 1.5 for arrows, quantity controls and accordion markers; hide decorative icons from assistive technology.

## Motion

Subtle and fast: image fade-in on load (150ms), drawer and sheet enter (220ms) and faster exit (160ms), progressive native accordion height, and 140ms press feedback. Drawers use `cubic-bezier(0.32, 0.72, 0, 1)`; other motion uses `cubic-bezier(0.23, 1, 0.32, 1)`. Keep overlays interruptible and retain focus and scroll lock until exit finishes. Phone carts dismiss with a rightward swipe; artwork inspection uses anchored transform zoom up to 4×. Adding an item briefly ticks the cart count.

The mission strip is the only thing that moves by itself, and it is pausable. Everything else moves because someone touched it: the box turns under a pointer or a finger (see "The box that turns"). The one exception is the box's single hint turn on touch screens. There is no hero entrance animation. Reduced motion keeps short opacity and colour fades, removes decorative transforms, the live pulse and the strip's movement, and keeps explicit image zoom usable. No parallax, scroll-jacking or Lenis.

## Imagery

Use the files in `web/public/images/products/*` and `web/public/images/brand/*`. Use `srcset` and `sizes` with lazy loading below the fold and `fetchpriority="high"` on the hero. Always set width and height or an aspect ratio to avoid layout shift. Alt text describes the artwork, for example "Puzzle of the colorful GUAM letter sign on the sand at Tumon Bay." The emblem is `logo-emblem-{240,480,960}.webp` through `<Emblem sizes=…/>`; `web/scripts/build-brand-assets.sh` regenerates it and the wordmark from Christian's originals.

The core Tumon puzzle leads with `finished-flat` (12:7), followed by `piece-detail` and `finished-tabletop`. The portrait tabletop scene is the home hero and its edge preload. The square/landscape duplicate crops and misprinted box-front stay on disk but are omitted from the catalog gallery. Cart thumbnails contain the full artwork.

## Copy voice

Plain, warm and brief. Chamorro words appear naturally (Håfa Adai, Guåhan). Avoid hype words ("insane", "fire"), exclamation marks, and invented scarcity.

## Accessibility and performance

WCAG AA contrast, visible focus (2px `--color-green` outline, 2px offset; cream on the green strip), and semantic landmarks. Drawers and sheets trap focus and close on Esc. Form errors are tied to inputs. Target LCP under 2.5s on mid-range mobile: preload the hero image and font, and use no heavy animation libraries.
