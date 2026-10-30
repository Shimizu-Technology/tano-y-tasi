# Founder look previews

2026-10-30 · Based on `bad11b7` and Christian's feedback supplied with this task.

Tåno + Tåsi sells puzzles of Guåhan to locals and the diaspora, with plans for novelty goods and apparel. A phone visitor should understand the connection to home and find the collection quickly. The catalog, availability, release times, cart, checkout, and admin remain the existing implementation.

Sources: [Product brief](PRODUCT_BRIEF.md), [design direction](DESIGN_DIRECTION.md), the brand paragraph in `web/src/pages/StorePages.tsx`, Christian's supplied words, logo and distressed wordmark, and the supplied Ordinary Habit and Salem Goods screenshots. No matching project note was found in the local Brain Dump. The supplied feedback authorizes these preview alternatives to the current design direction; it does not select a permanent redesign.

## Try a look

Add `?look=1`, `?look=2`, or `?look=3` to any storefront URL. The choice lasts in sessionStorage for that tab's session. The preview bar preserves the path, other query parameters, and anchor. Exit (`?look=off`) clears the choice. An invalid parameter does not select a look. No parameter and no saved choice retains the existing storefront, with no `data-look` attribute or preview bar.

1. **Island Supply:** cream, brown ink, soft Fraunces display headings, distressed wordmark, teal collection/signup/footer bands, and a photo with the brand story.
2. **Sun & Hill:** warm sand, a large rounded logo beside the tabletop artwork, matching product tiles, and a slow mission strip separated by sun-and-hill marks. Hover or keyboard focus pauses it; reduced motion displays all three lines statically.
3. **Refined:** the existing Archivo and artwork-led layout, with a larger emblem, a clear hero mission, a static mission band, and restrained green ink.

The external `main.tsx` module sets the attribute before rendering and updates it on router navigation. Admin routes remove the attribute and ignore preview parameters without clearing the saved storefront choice. No inline script, API contract, edge snapshot, canonical metadata, payment, or database change is needed.

## Assets

`web/scripts/build-look-assets.sh <source-folder>` reproduces the derivatives with ImageMagick. It reads the original files without modifying them.

- Distressed wordmark: cream and ink WebP at 360, 720, and 1440 pixels wide. Alpha and worn-print texture are retained; empty outer margins are trimmed. The 360/720 pair serves the 56px header; larger versions support footer/editorial use.
- Rounded logo: transparent PNG and WebP at 1200 × 990. The supplied JPEG has a larger, cleaner silhouette than the existing 800px asset. Black and its compressed edge pixels are removed; the cutout was inspected on sand. The original default logo remains unchanged.

## Acceptance and QA

Agent-executed affected-flow QA uses isolated browser/MSW fixtures (`VITE_API_MOCKS=true`), not an API or database. Required viewport coverage is Chromium at 390 × 844 and 1440 × 900. Physical-device and production deployment verification are outside this task.

| Case | Required action and expected outcome | Coverage |
| --- | --- | --- |
| P01 | Open each preview, follow shop → product, reload; look persists and default stays unchanged | Both sizes, all looks + default |
| P02 | Add the $35 core puzzle; cart shows one item and $35 subtotal; switch/exit without losing it | Both sizes, all looks; switch/exit separately |
| P03 | Open upcoming drop; artwork, ChST/PT/HT times and disabled release button remain | Both sizes, all looks + default |
| P04 | Open mobile menu, follow Shop; sheet closes and current look persists | Mobile, all looks + default |
| P05 | Marquee moves; focus pauses it; reduced motion makes it static with no duplicate copy | Both sizes |
| P06 | Enter admin with a saved look and parameter; no preview attribute/bar, original admin works | Both sizes |
| P07 | Text bands pass AA; preview links have 44px targets and visible focus; no horizontal overflow | Both sizes |
| P08 | Home, product, drop, cart and mobile menu are captured and visually inspected; each look gets a refinement pass | 36 final captures |
| P09 | Signup succeeds, Story and Archive remain reachable, and simulated checkout stays paid after reload | Both sizes, all three previews |

The first pass added a product description to Look 1, reduced the mobile logo height in Look 2, and shortened Look 3's mobile artwork so its mission appears sooner. A contrast pass replaced orange focus rings on light preview grounds with green; dark bands use cream. Initial and final captures, contrast measurements, gate logs, and the comparison sheet live in the requested external `looks/` evidence folder. Gate counts and final acceptance results are recorded there in `QA.md`.

Impeccable's Fraunces warning is an intentional choice required by this brief, not a functional blocker. Product prices, release dates, quantities, and specifications remain the existing mock/production data; their commercial approval is unchanged.
