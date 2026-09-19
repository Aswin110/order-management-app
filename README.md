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

2. Configure environment. Copy `.env.example` to `.env` in the repo root. For local
   development the only variable you need to set is:

   - `DATABASE_URL` - PostgreSQL connection string

   Everything else is optional locally: `shopify app dev` injects `SHOPIFY_API_KEY`,
   `SHOPIFY_API_SECRET` and `SHOPIFY_APP_URL`, access scopes come from
   `[access_scopes]` in `shopify.app.toml`, and the Redis/export settings
   fall back to `localhost:6379` and `<cwd>/exports`. See `.env.example` for the
   full list to set in production.

3. Create the database schema:

   ```bash
   pnpm run setup    # prisma generate + migrate deploy ("run" is required: `pnpm setup` is a built-in pnpm command)
   ```

4. Link your own Shopify dev app. This is interactive - choose **Create a new
   app**, then pick a dev store. `--config dev-<yourname>` writes
   `shopify.app.dev-<yourname>.toml`, which is gitignored, so your personal
   `client_id` never lands in the shared config:

   ```bash
   pnpm app:link --config dev-aswin
   pnpm app:use dev-aswin
   ```

   Then copy the `[access_scopes]` and `[webhooks]` blocks from the tracked
   `shopify.app.toml` into your new dev config, and add
   `web_directories = ["apps/web"]`. A freshly created app has empty scopes and
   no `orders/*` subscriptions; without them the dashboard loads but never
   updates.

5. Request **protected customer data** access for your dev app in the Developer
   Dashboard (App > API access > Protected customer data access). Order payloads
   contain customer PII, so without it `shopify app dev` fails with "This app is
   not approved to subscribe to webhook topics containing protected customer
   data."

## Shopify commands

`shopify.app.toml` lives at the **workspace root**, not in `apps/web`. That is
deliberate, and it is what makes this work as a pnpm monorepo:

- The CLI runs `npm prefix` from the config's directory and then looks for a
  lockfile *in that directory only*, without walking up. With the config in
  `apps/web` (no lockfile there) it falls back to npm, and `npm install` then
  dies on `workspace:*` with `EUNSUPPORTEDPROTOCOL`. At the root it finds
  `pnpm-lock.yaml` and correctly picks pnpm.
- The CLI skips dependency installation entirely when the app uses workspaces,
  which it detects via `pnpm-workspace.yaml` next to the config - again, root only.
- `web_directories = ["apps/web"]` points the CLI at the web process, whose
  `apps/web/shopify.web.toml` stays where it is.

So every command just runs from the root:

| Root command | Runs |
| --- | --- |
| `pnpm dev` | `shopify app dev` |
| `pnpm app:link` | `shopify app config link` |
| `pnpm app:use` | `shopify app config use` |
| `pnpm app:info` | `shopify app info` |
| `pnpm app:deploy` | `shopify app deploy` |
| `pnpm app:generate` | `shopify app generate` |
| `pnpm app:env` | `shopify app env` |
| `pnpm shopify <args>` | the raw CLI |

Extra flags are forwarded: `pnpm app:link --config dev-aswin`.

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
2. Set the production env vars listed in `.env.example`.
3. `pnpm install && pnpm run setup && pnpm build`
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
