# Tåno + Tåsi

*A Piece of Home.* This is the storefront for Tåno y Tåsi, a Guam/Chamorro puzzle and lifestyle brand founded by Christian Tenorio, built by Shimizu Technology.

- `api/`: Rails 8 API (catalog, drops, inventory reservations, checkout, payments)
- `web/`: React 19 + Vite storefront (mobile-first)
- `docs/`: product brief, design direction, API contract

Checkout collects the address on our own site and hands off to Stripe with the chosen shipping option. Rates are flat until EasyPost is connected: set `EASYPOST_API_KEY` and `EASYPOST_WEBHOOK_SECRET` on the API, then choose EasyPost under Store, Shipping and tax in the admin. Tax stays off until Stripe Tax is set up. See `docs/API_CONTRACT.md` and `docs/ADMIN_API_CONTRACT.md`.

See `AGENTS.md` for local setup, database safety and quality gates.

## The puzzle home preview

The site has two home pages. The live site keeps the classic one. The puzzle home, where scrolling puts the Guåhan map together, is a preview for comparing side by side:

- Live: https://tanoytasi.shimizu-technology.com
- Puzzle home: https://puzzle.shimizu-technology.com

Both use the same API and catalog; only the home page differs. The preview is a Netlify branch deploy (free, unlike production deploys) of the `puzzle` branch, which `netlify.toml` builds with `VITE_HOME_EXPERIENCE=puzzle`. Outside Netlify DNS, Netlify only names a branch deploy under the site's primary domain (`puzzle.tanoytasi.shimizu-technology.com`, with a certificate from support), and `shimizu-technology.com` is on Cloudflare, so `puzzle.shimizu-technology.com` is a domain alias of the site (a DNS-only Cloudflare CNAME to `tano-y-tasi.netlify.app`) that `netlify.toml` proxies to the branch deploy at https://puzzle--tano-y-tasi.netlify.app. The API allows both origins through `WEB_APP_URL`. Checkout and emails still send people to the live site. Every non-production deploy, the preview included, sends `X-Robots-Tag: noindex`, so search engines keep to the live site.

The `puzzle` branch carries no code of its own. To bring the preview up to date after merging to `main`:

```sh
git push origin origin/main:puzzle
```

Each build carries only its own home page: `vite.config.ts` points the `@home-page` import at `src/pages/home.classic.ts` or `home.puzzle.ts`. To make the puzzle home the live home page, set `VITE_HOME_EXPERIENCE=puzzle` for production builds. Locally, `VITE_HOME_EXPERIENCE=puzzle npm run dev` serves it, and `npm run test:e2e` tests both home pages.
