# Tåno + Tåsi storefront

React 19, React Router 7 data router, TanStack Query, Zustand, Vite, TypeScript strict mode, and Tailwind v4. The existing artwork derivatives are preserved.

Use Node 22.22.2 or newer (verified locally with 22.22.3). From this directory:

```sh
npm ci
cp .env.example .env
npm run dev
```

The dev server uses `localhost:5181` with `strictPort`; preview uses `4181`. The API defaults to `http://localhost:3031`. Use `http://localhost:5181` in the browser and as Rails’ `WEB_APP_URL` so payment returns share the cart’s storage origin. The example defaults both development flags to `false` and uses Rails. With a real local simulated provider, also set `VITE_SIMULATED_PAYMENTS=true`; its payment page is available only in Vite development mode. Production builds reject `VITE_API_MOCKS=true` or `VITE_SIMULATED_PAYMENTS=true`. MSW startup, its worker, and the simulated payment route/page are development-only and excluded from production output.

## Mock development

In Vite development mode only, `VITE_API_MOCKS=true` starts MSW before React renders. `src/mocks/handlers.ts` is shared by the browser worker, Vitest's Node server, and the Playwright app. No Rails instance is needed for web CI.

Open one of these URLs to choose the drop state:

```text
/?mockDrop=upcoming
/?mockDrop=live
/?mockDrop=sold_out
/?mockDrop=closed
```

The state is remembered in `sessionStorage`. Changing it resets the mock inventory and orders. The in-memory mock database is saved to this tab's session storage so checkout redirects and reloads retain reservations and orders. Start a fresh tab session or clear the `tyt-mock-*` session keys to reset the fixture. It is a development simulation, not shared inventory across tabs or users.

With mocks enabled in Vite development mode, `?mockCore=1|2|3` previews the collection layouts on Home and Shop. For example, `/shop?mockDrop=upcoming&mockCore=2`. Counts 2 and 3 add duplicated artwork with distinct `-mock-2` / `-mock-3` slugs and names explicitly marked “Mock”. Product links and checkout use those mock slugs. The count persists in this tab's session storage; use `?mockCore=1` to restore the seed. This count override is ignored by production builds, which cannot enable either development flag.

One core product uses a feature row (7:5 image/info split at desktop, stacked on phones). Two products use full-width cards below 600px and equal columns above it; three or more retain the 2-column mobile / 3-column desktop grid. Featured specs come from the existing product-detail endpoint.

Archivo's variable font is preloaded and its face declarations load from the HTML head. Initial rendering waits for the body, title and wide display/wordmark faces. Screenshot capture also waits for `document.fonts.ready` and verifies an actual loaded Archivo face.

Use `?mockPayment=same_key` or `?mockPayment=new_checkout` on the initial page to simulate one transient or definitive provider failure. These fixtures preserve or release the reservation and return the Rails contract’s `details.retry`.

The seed has 40 core puzzles and the brief's 100 map puzzles. Checkout reserves stock for 30 minutes, enforces per-email limits across paid and pending orders, reuses identical idempotency requests, and releases reservations on cancellation or expiry. The local TEST MODE page completes or cancels payments. No external payment or email service is called.

The persisted cart contains product slugs, quantities and a revision identifier. The drawer fetches fresh product details before checkout, remembers the email separately, and retains one UUID for retries of the same checkout payload. Each attempt snapshots its cart revision and receives the order token. Paid reconciliation clears only that unchanged revision and removes only its matching attempt; newer carts and unrelated reservations remain intact. Reconciliation is recorded per order token. Transient provider errors offer “Try again” with the same key, even when the reservation holds the last unit; definitive rejection offers “Start a new checkout” with a fresh key. Payment redirects accept only Stripe HTTPS checkout URLs, plus the exact same-origin simulated route in development.

## Quality gates

```sh
npm run lint
npm test
npm run build
npm run check:dist
npm run audit:prod
npx playwright install chromium
npm run test:e2e
```

Playwright manages its own mock-enabled Vite server on 5181. It tests touch/mobile (390×844) and desktop (1440×900), and writes the visual review set to `.screenshots/` (gitignored). The workflow in `../.github/workflows/web.yml` runs the same gates on pull requests and pushes to main.

See `QA.md` for acceptance evidence, contract decisions, screenshot paths, and integration limits.
