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


## Lead review polish — 2026-10-29

Based on `8d8fae6`, with changes confined to `web/`. Sources: the lead's six-item review, `docs/DESIGN_DIRECTION.md`, `docs/PRODUCT_BRIEF.md`, and the existing API types and mock contracts. The audience, drop rules, purchase flows and integrations above still apply. This follow-up supersedes the earlier decision to leave a single core product in a 2/3-column grid.

Acceptance was agent-executed affected-flow QA using MSW only: Home in upcoming/live/no-active-drop states; Home and Shop with 1, 2 and 3 core products; product navigation from each layout; mobile map/Tumon gallery width and swiping; retained desktop gallery stacking; Archivo loading and wide settings; cart copy; and the full existing regression suite. Required viewports were 390×844 and 1440×900. Chromium touch emulation does not establish real-device touch feel. No external payment/email, production deployment, or Rails/Postgres behavior was tested in this pass.

Changes:

1. Home and Shop share `ProductCollection`: one product gets a square feature image, title, price, summary, fetched piece/size details and a View Puzzle action. Desktop uses a 7:5 split; mobile stacks the image above the information. Two products use full-width cards at 390px (long names and prices have room), then equal columns from 600px. Three or more retain the existing 2/3-column grid. `?mockCore=1|2|3` is Vite-development-only, remembers the count in the tab, and adds explicitly named mock products with distinct slugs and working detail/checkout data.
2. Below 768px the hero art is an uncovered full-bleed 4:5 image; the caption follows on paper with 32px spacing and no overlay box. Desktop retains the positioned paper caption. The map is contained at the right of a 16:9 hero so the painted title, villages and island silhouette stay intact; the caption sits left. The Tumon desktop caption moves right and the crop moves down, exposing the large G/U sign and puzzle cut at the left. Mobile Tumon remains uncovered.
3. The story label, 36ch paragraph and link now align to the same content edge as the collection and signup sections.
4. Archivo face declarations load from the HTML head, using the existing preloaded variable Latin woff2 and block display. Initial React rendering awaits body/title/wide face loading, with a graceful font-error fallback. Wide display and wordmark settings remain 125% across breakpoints. Screenshot capture explicitly loads the used styles, awaits `document.fonts.ready`, and checks an actual loaded variable face. The final captures show consistent Archivo body copy and wide headlines.
5. Mobile gallery images use their intrinsic aspect ratio at the full 358px content width, capped at 80svh with cover behavior. The portrait map has no side letterboxing. Desktop stacking, image viewer and zoom are preserved.
6. Cart note: “Your puzzles are held for about 30 minutes at checkout.” The mock reservation clock remains its existing 30-minute simulation; the real API's approximately 31-minute hold is owned by the API branch.

Final gates (Node 22.22.3, macOS):

- `npm run lint`: passed, 0 findings.
- `npm test`: 36/36 passed in 6 files, including 4 new collection component tests.
- `npm run build`: passed, strict TypeScript plus production Vite build. The generated HTML preload resolves to the hashed Archivo woff2 asset. Mocks-off JS is 394.61 kB / 122.39 kB gzip.
- `npm run test:e2e`: 48/48 passed (24 mobile, 24 desktop), 0 skipped, 0 retries. Six added cases per project exercise the changed layouts and adjacent flows; all 18 existing journeys per project still pass.
- `npm run audit:prod`: passed, 0 vulnerabilities.
- `IMPECCABLE_NO_TELEMETRY=1 npx impeccable@4.6.0 detect --json web/src`: exit 0, `[]`; no findings. No package or hooks installed. Output: `web/impeccable-findings.json`.
- `git diff --check`: passed.

Retest history: the shell initially selected Node 22.0.0 and unit workers failed before executing tests; all final gates used the documented supported Node. An initial browser run passed 46 tests, failed the mobile menu's overflow evaluation when its page reloaded, and skipped the desktop-only dimension of a mobile gallery case. The final run made no build/scan writes while Vite was serving, exercised desktop gallery stacking as well, and passed all 48. The first screenshot review also caught the Tumon caption obscuring the sign; moving it right was verified in the final captures. T3 preview snapshot calls timed out twice; the task-owned tab was closed. The repository Playwright harness supplied the accepted runtime journeys and screenshots.

All 13 requested captures below were recaptured and critically inspected for image crops, type, spacing, alignment, price/name readability and actions. One-product feature rows now fill the collection deliberately. Two-product mobile cards have readable full-width names; three-product mobile cards retain the requested grid with natural wrapping. The desktop story aligns to the content edge. Map labels are intact, mobile captions do not cover artwork, and the mobile map gallery is full content width. No required case failed, blocked or remained not run in this browser scope.

Screenshot paths (full-page PNGs captured at the named viewport, local/gitignored):

- `web/.screenshots/mobile-home-upcoming.png`
- `web/.screenshots/desktop-home-upcoming.png`
- `web/.screenshots/mobile-home-live.png`
- `web/.screenshots/desktop-home-live.png`
- `web/.screenshots/mobile-home-no-drop.png`
- `web/.screenshots/desktop-home-no-drop.png`
- `web/.screenshots/mobile-shop-core-1.png`
- `web/.screenshots/desktop-shop-core-1.png`
- `web/.screenshots/mobile-shop-core-2.png`
- `web/.screenshots/desktop-shop-core-2.png`
- `web/.screenshots/mobile-shop-core-3.png`
- `web/.screenshots/desktop-shop-core-3.png`
- `web/.screenshots/mobile-drop-upcoming.png`

Additional Home count previews: `web/.screenshots/{mobile,desktop}-home-core-{1,2,3}.png`. The full regression screenshot set was also refreshed. Playwright's report remains in `web/playwright-report/`.

Resources: the two claimed Playwright runs (root PIDs 8560 and 42467) and their managed Vite/browser children exited. Port 5181 has no listener; the task-created T3 preview tab was closed. No task-owned server, browser, simulator or container was left running. Shared baseline services were left unchanged. The lead changed these lifecycle records to handoffs during execution; the helper's release command subsequently reported no owned record, and the inactive historical handoff entries remain in the session ledger.

## PR #2 review fixes — 2026-10-29

Tested implementation: `3f42b70b8e7608a498c7c7af507f6d6913f12054`, based on `841199f`. Sources: the seven verified review findings, root `AGENTS.md`, `docs/PRODUCT_BRIEF.md`, `docs/DESIGN_DIRECTION.md`, `docs/API_CONTRACT.md`, and the preceding QA record. The audience remains phone-first Guam shoppers and diaspora; Rails owns stock, customer limits and payment state. Scope is checkout recovery, reconciliation and production isolation. This section supersedes the earlier acceptance of mock-enabled production builds. No deployment was performed.

All seven findings were addressed:

1. `main.tsx`, `routes.tsx` and the extracted `pages/SimulatedPage.tsx` gate development code with `import.meta.env.DEV`. The worker moved from `public/` to `mocks/` and is served only by Vite's dev middleware. Build configuration rejects either true mock/payment flag; `.env.example` defaults both to false. `scripts/check-production.mjs`, run in CI after building, scans every emitted text chunk for worker, handler and simulated-page markers and verifies both unsafe flags fail the build.
2. Rails checkout now returns `details.retry: "same_key"` while keeping a transient reservation and `"new_checkout"` after definitive rejection or an ended unsessioned hold. The drawer retains or replaces the key and offers the corresponding recovery action. MSW models both outcomes.
3. A saved attempt for the unchanged email, payload and cart revision can retry despite refreshed zero stock. New attempts still require fresh availability.
4. Cart changes persist a new revision. Checkout snapshots contain the revision, items, key and eventual order token. Paid reconciliation clears only its unchanged cart and removes only its matching attempt; it remains idempotent per order token and refreshes persisted cart state before comparing revisions.
5. Rails limit errors include `product_slug`, with request/service assertions. The contract documents all checkout error detail shapes. MSW validation, duplicate-line aggregation, error messages/details and expiry grace were aligned; the drawer also recovers safely from older responses lacking a slug. MSW does not simulate IP throttling or real provider transport.
6. `utils.ts` preserves cents while hiding `.00`, with four price assertions.
7. `paymentRedirect.ts` validates the parsed HTTPS Stripe checkout host; development additionally accepts the exact same-origin simulated route. Invalid destinations show a cart-preserving error. Tests cover hostile URLs and production/development behavior.

Final automated gates:

- Web lint: passed; Vitest: 63/63 tests in 8 files (27 additional tests). New coverage is in cart, order state, cart drawer, payment redirect, price and mock-contract tests.
- Production TypeScript/Vite build and `npm run check:dist`: passed. No MSW worker, mock handlers or simulated payment page in `dist`; both unsafe flags rejected.
- Playwright: 56/56 results, 28 journeys at both mobile 390×844 and desktop 1440×900, no retries. The four added journeys below account for eight results.
- `npm run audit:prod`: passed, zero vulnerabilities.
- API RSpec: 130 examples, zero failures; final recovery-spec rerun: 9 examples, zero failures. Before each RSpec phase, `RAILS_ENV=test bin/rails runner 'puts ActiveRecord::Base.connection.current_database'` printed `tano_y_tasi_test`. No development or unrelated database was used.
- API RuboCop: 68 files, no offenses; Brakeman: zero errors/warnings; bundler-audit with updated advisory DB: zero vulnerabilities.
- Impeccable 4.6.0 on the changed UI files: `[]`, exit 0. `git diff --check`: passed.

Agent-executed affected-flow acceptance used isolated per-browser MSW fixtures, example.com emails and no external payment/email services. Each required case passed at both viewports:

| Case | Starting fixture and actions | Verified outcome |
| --- | --- | --- |
| R01 | Core puzzle, one transient failure; checkout → Try again → test payment | Same key, one order/reservation, paid confirmation and empty cart |
| R02 | Core puzzle, one definitive rejection; checkout → Start a new checkout → payment | Rejected attempt removed, fresh key/order, paid confirmation and empty cart |
| R03 | One core unit; transient setup failure → reopen refreshed drawer → retry → payment | Stock remained zero while held, retry stayed enabled, original key reused, final stock zero |
| R04 | Start A → remove/re-add product through cart controls → start B → pay A → reload | New cart quantity and B's saved attempt survived both first reconciliation and reload |

All 24 existing journeys also passed in both projects, including ordinary checkout, cancellation recovery, limits, navigation and layout. Earlier lint/TypeScript checks caught test/configuration issues; they were fixed before the final passing gates. Collaborative preview snapshots failed twice with `Preview automation snapshot timed out after 15000ms.` The tab was closed; browser acceptance comes from Playwright. Unit/component tests separately cover missing-slug recovery, untrusted redirects, cent formatting and cross-tab persisted-cart reconciliation.

Limits: Chromium touch emulation, not physical devices; no Safari/Firefox, live Stripe, real email, production deployment or real web-to-Rails end-to-end payment run. Rails behavior was verified independently through its test database and stubbed provider transport. The lead retains final PR review and merge decisions.

Resources: Playwright's owned process tree rooted at PID `49808` exited, including Vite PID `49897`; port 5181 has no remaining listener. Preview tab `tab_4w_f7aafa60-06cd-4aa5-a119-6dc8f3b268f3` was closed. Their records were released in both the current hook session `01a184e8-bdcd-70b0-a9e1-4dd89115511e` and the supplied session `db0f0ba3-e316-4410-bf82-d05b447f7412`. Both report no active owned resources. Pre-existing handoff records were left untouched. No session cleanup execution or broad kills were used. The branch/worktree remain available for the lead; no merge or GitHub comment was made.
