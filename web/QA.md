# Storefront implementation and acceptance

Orientation: 2026-10-29, feature/storefront, base 0a2d197. Sources: root AGENTS.md, docs/PRODUCT_BRIEF.md, docs/DESIGN_DIRECTION.md, docs/API_CONTRACT.md. This new storefront serves Guam locals, visitors, and Chamorro diaspora arriving mostly on phones. Core puzzles restock; numbered drops never restock. Money is USD cents; inventory and cross-order customer limits belong to the API. No existing web app or deployment to preserve. This worker changes only web/ and its CI workflow.

Design: Archivo, paper/ink tokens, square edges, artwork-led pages, restrained navigation. Cart and menu enter in 220ms to explain their position; reduced motion is immediate. Product gallery uses native scroll snapping. No decorative motion beyond the live state dot.

Acceptance / agent-executed comprehensive web QA: hero and collection; both product galleries; all drop states and Guam-first dates; cart focus/keyboard/limits; checkout payment and cancellation recovery; order polling; signup validation/idempotency; empty archive and 404; layout at 390×844 and 1440×900 plus 320px overflow. Fixtures use the local MSW seed and no external payment or email services. Real Postgres concurrency and Rails integration belong to the API/integration lead. Real hardware touch feel and production performance are outside this browser-emulation check.

Execution evidence and final gate results are appended after implementation.

## Execution record

Tested implementation commit: `95535e7fa19ad1437bbddaef75e98973103c16f2` (all source and test changes). The following documentation commit changes this report only. Date: 2026-10-29. Agent-executed, local macOS, Node 22.22.3, Chromium, MSW only. Browser fixtures are isolated per test context; emails are example.com test addresses. No customer records or external payment/email providers were used.

- `npm run lint`: passed, no findings.
- `npm test`: passed, 32 tests in 5 files. Covers cart limits/persistence/recovery, cross-tab paid-order reconciliation, Guam/PT/HT time conversion and DST, server clock skew/countdown boundaries, every purchase state, checkout error fixes, subscription completion, and the shared mock's inventory/idempotency/limits/expiry behavior.
- `npm run build`: passed, strict TypeScript and production Vite build. Mocks-off bundle is about 393 kB JS / 122 kB gzip. Mock-enabled production build also passed and loaded live-drop content with the correct route title in Chrome on preview port 4181.
- `npm run test:e2e`: passed, 36/36 (18 mobile, 18 desktop), no retries in the final local run. Playwright used its own mock-enabled Vite webServer on `http://localhost:5181`.
- `npm run audit:prod`: passed, 0 vulnerabilities.
- Impeccable 4.6.0: `IMPECCABLE_NO_TELEMETRY=1 npx impeccable@4.6.0 detect --json web/src` returned `[]`, exit 0. No findings to disposition. Result retained in `web/impeccable-findings.json`. It was not installed into the project.
- `git diff --check`: passed. Existing `web/public/images/` derivatives were preserved.

## Accepted web scenarios

All cases below passed at both required viewports: mobile 390×844 with touch emulation, desktop 1440×900. Each starts with a fresh visitor browser context and the named MSW state. The numbers count 18 journeys, each with two executed viewport dimensions (36 results).

- Q01, upcoming fixture: Home shows the map hero, release action and core collection.
- Q02, live fixture: Home links directly to the live drop.
- Q03, upcoming fixture: Shop shows the Tumon core puzzle and price.
- Q04, upcoming fixture: Drop displays Sat Dec 5 10:00 AM ChST first, then Fri Dec 4 4:00 PM PT / 2:00 PM HT; purchase is disabled.
- Q05, live fixture: Stepper stops at 2; cart preserves quantity 2, disables further increase, and totals $90.
- Q06, sold-out fixture: Artwork remains visible; dated sold-out explanation and disabled purchase remain.
- Q07, closed fixture: Closed purchase is disabled; the release appears in Archive.
- Q08, core fixture: Product → cart → email → simulated payment → paid confirmation, $35 total. Reload remains paid and the cart remains empty.
- Q09, map fixture: Gallery opens in a full-screen dialog; zoom doubles rendered image dimensions; Esc closes and restores focus.
- Q10, core fixture: Cancel releases the reservation and restores quantity 1. Reload does not duplicate it; a fresh checkout completes successfully.
- Q11, empty cart: Keyboard opens drawer, Shift+Tab stays within it, Esc closes and returns focus to the cart trigger.
- Q12, upcoming fixture: Mobile menu shows stacked navigation and closes with Esc. Desktop dimension tests an open mobile menu retained after resizing.
- Q13, story fixture: Land/sea meaning, founder placeholder and real tabletop image render.
- Q14, upcoming fixture: Empty archive points to the first release.
- Q15, subscriber fixture: Invalid email stays in the form; valid email produces a saved subscription confirmation.
- Q16, live fixture: A paid quantity 2 exhausts the same email's allowance, case-insensitively. A subsequent checkout shows the inline limit message; Remove recovers to the empty cart.
- Q17, all route fixtures: Home, Shop, Drop, historical Drop, both products, Story, Archive, 404, missing product/order/cancel/payment, and all footer information pages fit the required viewport. Home, Shop, Drop, Story, Archive and Tumon product also fit 320px without horizontal overflow. Paid/cancel/payment success route overflow is checked in the corresponding journeys.
- Q18, live fixture and test-only glyph proof: `å ñ ʻ '` render; reduced motion computes `animation-name: none` for the live indicator and `transition-duration: 0s` for the drawer.

Mock tests separately prove atomic last-unit checkout (one success, one sold-out response), repeated checkout/payment/cancel idempotency, 30-minute expiry recovery, and email limits across pending and paid orders. These are web simulation tests; they do not prove Rails/Postgres concurrency.

## Visual review

All 26 requested screenshots were captured and inspected for type, hierarchy, spacing, image crops, alignment, legibility and cramped controls. Refinements included explicit focus wrapping, calmer immediate payment confirmation, correct map-detail aspect ratios, working zoom dimensions and pointer capture, 96/160px spacing before the footer, and full 44px text-control targets. Core grids intentionally retain the design's 2/3 columns with the single seed core product. No repeated product tiles were invented to fill them.

The hero uses a paper caption at the bottom-left to keep copy legible over the richly detailed map, with no gradient or dark artwork overlay. The map remains fully inspectable on its detail page. Essential text contrast on paper: ink 16.36:1; muted ink 6.02:1. Disabled controls use the specified muted treatment. Archivo is self-hosted with both variable axes. Font-file inspection confirms å, ñ and straight apostrophe. Archivo omits U+02BB, so the browser's existing sans-serif fallback renders ʻ; the extra browser glyph screenshots below verify the actual result on this machine.

Screenshot paths, relative to the repository root (gitignored, retained locally):

- `web/.screenshots/mobile-home-upcoming.png`
- `web/.screenshots/desktop-home-upcoming.png`
- `web/.screenshots/mobile-home-live.png`
- `web/.screenshots/desktop-home-live.png`
- `web/.screenshots/mobile-shop.png`
- `web/.screenshots/desktop-shop.png`
- `web/.screenshots/mobile-drop-upcoming.png`
- `web/.screenshots/desktop-drop-upcoming.png`
- `web/.screenshots/mobile-drop-live.png`
- `web/.screenshots/desktop-drop-live.png`
- `web/.screenshots/mobile-drop-sold-out.png`
- `web/.screenshots/desktop-drop-sold-out.png`
- `web/.screenshots/mobile-product-tumon.png`
- `web/.screenshots/desktop-product-tumon.png`
- `web/.screenshots/mobile-product-map.png`
- `web/.screenshots/desktop-product-map.png`
- `web/.screenshots/mobile-cart.png`
- `web/.screenshots/desktop-cart.png`
- `web/.screenshots/mobile-menu.png`
- `web/.screenshots/desktop-menu.png`
- `web/.screenshots/mobile-story.png`
- `web/.screenshots/desktop-story.png`
- `web/.screenshots/mobile-archive-empty.png`
- `web/.screenshots/desktop-archive-empty.png`
- `web/.screenshots/mobile-confirmation.png`
- `web/.screenshots/desktop-confirmation.png`

Extra glyph/reduced-motion proof: `web/.screenshots/mobile-glyphs.png`, `web/.screenshots/desktop-glyphs.png`. Playwright's HTML report is in `web/playwright-report/` (gitignored).

## Contract decisions and integration notes

- List-item products from `/drops` do not contain galleries/specs. `/drop` selects a release from that list and fetches `/drops/:slug` for detail. Mocks preserve that distinction so a detail-only assumption cannot pass unnoticed.
- When there is no current or next release, `/drop` presents the newest archived release. Home uses the core tabletop hero because `/storefront.featured_drop` is null for sold-out/closed releases.
- Source derivative filename numbers are the contract's candidate labels, including portrait files whose labels describe the long edge. The app follows `${base}-${w}.webp` exactly and reserves the supplied aspect ratio; it does not rename or replace the artwork.
- Core mock stock is 40 because no core stock quantity was specified. The map uses the brief's 100 units, limit 2, $45, 500 pieces and 16 × 20 in. Unconfirmed commercial/art/packaging details remain visibly labeled.
- Simulated complete/cancel responses are consumed as `{order: ...}`, matching the other order endpoints. The browser test provider persists its in-memory database to this tab's session storage only so full payment redirects work; this is not multi-user inventory.
- Checkout sends canonical sorted line items and reuses a UUID for an unchanged email/cart payload. Paid-order reconciliation is recorded in local storage to prevent an old confirmation from consuming a newly built cart.
- Use `http://localhost:5181` for the browser and Rails `WEB_APP_URL`. Local storage is origin-specific; mixing `127.0.0.1` with `localhost` would lose cart context on a real payment return. Vite's default command and Playwright now use the documented localhost origin.
- With mocks disabled, requests go to `VITE_API_URL` (default `http://localhost:3031`). The real API's simulated page is opt-in and development-only; ordinary production builds cannot expose it.

## Retest history and limits

Initial browser failures exposed a cached pending order after simulated payment and native dialog reverse-tab focus escape. Fixed by updating the Query cache from the payment result and explicitly wrapping focus. The screenshot helper also incorrectly waited for a nonexistent main image on Archive; that test harness issue was fixed. One intermediate run overlapped formatting and HMR, producing two transient Home failures; a subsequent unchanged-source run passed. Final clean execution includes all fixes and all 36 results passed.

Not run / outside this worker's acceptance: real Rails API integration and Postgres last-unit concurrency, Stripe transport/webhooks, real email, shipping/tax/fulfillment, production deployment, measured mobile LCP, Safari/Firefox, physical-device keyboard/pinch feel, and formal screen-reader or complete WCAG audit. They remain integration/release checks for the lead. Visibility-aware capped order polling is implemented; the 60-request/10-minute exhaustion path was reviewed in code rather than waited out in browser QA. No known web acceptance blocker remains against the supplied mock contract. Commercial values, rights, founder copy, contact/policy/social details remain the brief's explicitly deferred placeholders.

Collaborative preview snapshots timed out twice. Chrome loaded the mock-enabled production build and its correct content/title, but its next automation interaction timed out; functional acceptance and screenshots therefore come from the successful local Playwright runs. Physical-device motion has not been claimed from screenshots.

## Resources and delivery

The runtime hook supplied session `01a184b1-9dfb-7292-a0e3-91b6460bfe48`; owned resources were tracked there under `web-worker`. Preview PID `62539` was validated, stopped with TERM and released. Collaborative preview tab `tab_4p_f7aafa60-06cd-4aa5-a119-6dc8f3b268f3` and Chrome QA tab `1583520614` were closed and released. Chrome's one-tab Storefront QA group was closed without deleting its synced saved-group bookmark. Playwright-managed browsers and webServers exited with their runs. Final lifecycle status reports no active owned resources. No session-wide cleanup or broad kills were used, and borrowed resources were left unchanged.

Branch `feature/storefront` and its worktree are retained for the lead to integrate. No PR, merge or deployment was performed.
