# Tåno + Tåsi

*A Piece of Home.* This is the storefront for Tåno y Tåsi, a Guam/Chamorro puzzle and lifestyle brand founded by Christian Tenorio, built by Shimizu Technology.

- `api/`: Rails 8 API (catalog, drops, inventory reservations, checkout, payments)
- `web/`: React 19 + Vite storefront (mobile-first)
- `docs/`: product brief, design direction, API contract

Checkout collects the address on our own site and hands off to Stripe with the chosen shipping option. Rates are flat until EasyPost is connected: set `EASYPOST_API_KEY` and `EASYPOST_WEBHOOK_SECRET` on the API, then choose EasyPost under Store, Shipping and tax in the admin. Tax stays off until Stripe Tax is set up. See `docs/API_CONTRACT.md` and `docs/ADMIN_API_CONTRACT.md`.

See `AGENTS.md` for local setup, database safety and quality gates.
