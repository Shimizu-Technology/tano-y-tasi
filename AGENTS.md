# Tåno + Tåsi — Agent Instructions

A custom storefront for Tåno y Tåsi, a Guam/Chamorro puzzle and lifestyle brand. Read these before changing anything:

- `docs/PRODUCT_BRIEF.md`: purpose, users, scope, acceptance.
- `docs/DESIGN_DIRECTION.md`: the visual and interaction system. Follow it; propose changes, don't drift.
- `docs/API_CONTRACT.md`: the API both apps rely on. Change the contract doc in the same PR as any API change.

## Structure

- `api/`: Rails 8 API (Ruby 3.3.4, PostgreSQL 16). RSpec, RuboCop (rails-omakase), Brakeman, bundler-audit.
- `web/`: React 19 + Vite + TypeScript + Tailwind CSS v4. Vitest + Testing Library, Playwright for browser smoke tests, ESLint.
- `web/public/images/`: optimized derivatives of Christian's artwork. The originals live in the gitignored `design-source/` folder in Leon's main checkout only.

## Local development

| Service | Command | Port |
|---|---|---|
| API | `cd api && bin/rails server -p 3031` | 3031 |
| Web | `cd web && npm run dev` (Vite configured for 5181, strictPort) | 5181 |

Ports 3000 and 5173 are used by other Shimizu projects; don't use them here.

### Database safety (mandatory)

Several Shimizu Rails repos share this machine's Postgres, and a generic `api_development` database has been wiped by accident before. This app's databases are **`tano_y_tasi_development`** and **`tano_y_tasi_test`** only.

- Never set `DATABASE_URL` to another project's database. Before any `db:` command (create, migrate, seed, reset, drop), confirm the target:
  `bin/rails runner 'puts ActiveRecord::Base.connection.current_database'` must print a `tano_y_tasi_*` name.
- Never run `db:drop`, `db:reset` or `db:schema:load` against anything else.

### Payments

- `PAYMENT_PROVIDER=simulated` (dev/test default) or `stripe`. The simulated provider is refused in production.
- Stripe needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `WEB_APP_URL`. No live keys belong in any file.

## Engineering rules

- Inventory and payments are the critical path. Reserve stock inside a DB transaction with row locks; never call external services while holding locks. Every payment event handler must be idempotent, and the database enforces uniqueness (Stripe session id, payment intent id, idempotency key, event id).
- Follow `../Brain-Dump/starter-app/order-processing-reliability-guide.md` patterns.
- Env booleans are parsed explicitly (`ActiveModel::Type::Boolean`).
- Use SVG icons, not emoji, in the UI. Keep the Chamorro diacritics in copy.
- Mobile-first: verify every UI change at 390×844 and 1440×900.

## Gates (must pass before a PR is ready)

- API: `bundle exec rspec`, `bundle exec rubocop`, `bundle exec brakeman --no-pager --quiet`, `bundle exec bundler-audit check --update`
- Web: `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`

## Workflow

Use the Shimizu PR workflow: an isolated worktree and branch per task, PRs into `main`, and CodeRabbit as the reviewer. Leon's standing preference is to merge ready PRs unless he says hold. Claim any local servers or browser tabs with `dev-lifecycle` and clean up only what you started.
