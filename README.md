# Order Operations

A Shopify embedded app that turns Shopify orders into a simple daily operations workflow: a fast order dashboard with configurable columns, saved views, filters, bulk actions, internal notes, staff assignment, and COD verification.

Not a replacement for Shopify Admin - an operational layer on top of it.

## Tech stack

- Shopify App Bridge + Polaris (React 18)
- React Router 7 + Vite (embedded app, `apps/web`)
- NestJS standalone worker + BullMQ (background jobs, `apps/worker`)
- Prisma + PostgreSQL (`packages/db`)
- Shared types/filter/mapping/CSV logic (`packages/shared`)
- pnpm 9.4 workspace (no Turborepo), TypeScript strict, Node 22.13+

## Repository layout

```
apps/
  web/        Shopify embedded app (auth, dashboard, settings, webhooks)
  worker/     Background jobs: order sync, CSV export, bulk actions
packages/
  db/         Prisma schema, migrations, client
  shared/     Filter schemas, column defs, queue contracts, order mapping, CSV, query builder
extensions/   Shopify app extensions (empty for MVP)
```

## Prerequisites

- Node.js >= 22.13 and pnpm 9.4 (`corepack enable`)
- PostgreSQL 14+
- Redis 5+ (for BullMQ background jobs)
- A Shopify Partners account and a dev store
- Shopify CLI (`pnpm shopify` runs the bundled one)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure environment. Copy `.env.example` to `.env` in the repo root and fill in:

   - `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` - from the app in the Shopify Dev Dashboard
   - `SHOPIFY_APP_URL` - your tunnel/host URL
   - `DATABASE_URL` - PostgreSQL connection string
   - `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`

3. Create the database schema:

   ```bash
   pnpm setup        # prisma generate + migrate deploy
   ```

4. Link the Shopify app config (fills `client_id` in `apps/web/shopify.app.toml`):

   ```bash
   cd apps/web && pnpm shopify app config link
   ```

## Running locally

Terminal 1 (web, creates a Cloudflare tunnel and installs on your dev store):

```bash
pnpm dev
```

Terminal 2 (background worker):

```bash
pnpm dev:worker
```

On first load the app registers in the database and enqueues the initial order sync. Webhooks (`orders/create`, `orders/updated`, `orders/cancelled`, `orders/fulfilled`) keep the local order index updated after that.

## Running tests, lint, typecheck

```bash
pnpm test         # vitest across all packages
pnpm lint         # eslint (web app)
pnpm typecheck    # tsc across all packages
```

Tests use mocked database/Shopify boundaries, so they run without PostgreSQL or Redis. To run against real infrastructure, provide `DATABASE_URL`/`REDIS_*` and run the worker plus `pnpm dev`.

## Deployment

1. Provision PostgreSQL and Redis.
2. Set all env vars from `.env.example` plus `SESSION_SECRET`.
3. `pnpm install && pnpm setup && pnpm build`
4. Run the web app: `pnpm --filter @order-operations/web run start`
5. Run the worker: `pnpm --filter @order-operations/worker run start`
6. Update the app URL and webhook endpoints in the Dev Dashboard to your production URL.

A Dockerfile for the web app is included. The worker deploys as a second process using the same image with the worker start command.

## Billing

Billing is intentionally not implemented in this MVP. The Settings page carries a placeholder and the plan limits are designed so Shopify Managed App Pricing can be attached later (Free: 100 orders/month; Pro: unlimited + saved views, bulk actions, staff assignment, COD workflow, CSV exports).

## Notes on architecture

- Shopify remains the source of truth for orders. PostgreSQL stores sessions, operational metadata (notes, assignments, COD status, saved views, settings) and a small indexed subset of each order for fast filtering/sorting/search.
- Webhook processing is idempotent via the unique Shopify webhook delivery id.
- Tag bulk actions call the Shopify GraphQL API (source of truth) and update the local index; note/assignment/COD bulk actions are local transactions.
- Every query is shop-scoped; there is no cross-shop data path.
