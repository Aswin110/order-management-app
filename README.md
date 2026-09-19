# Order Operations

A Shopify embedded app built for teams processing high-volume custom orders: a
fast, Shopify-native order viewer that shows the full order context - every
line item with product image, variant, quantity, price, and custom line-item
properties - directly in the orders list. No clicking into each order, no
background sync, no local order cache.

Not a replacement for Shopify Admin - a viewing and operations layer on top of it.

## How it works

- The orders list is a **live Shopify Admin GraphQL query** with cursor
  pagination and the native order search syntax (search, fulfillment/payment
  status, date range, tag, sorting).
- Each row expands into its line items inline: image, quantity, title,
  variant, unit price, and custom properties (personalization details) - the
  things a production team otherwise opens every order to see.
- The order details page shows the complete order (up to 100 line items) with
  totals, customer, shipping address, risk, and tags.
- App-internal operational data (internal notes, COD verification status,
  staff assignment, saved views, settings) is the only thing stored locally.
  It is keyed by Shopify order id and created lazily on first use, so it works
  for any order instantly.

## Tech stack

- Shopify App Bridge + Polaris web components (`s-*` elements, no Polaris React)
- React Router 7 + Vite (embedded app, `apps/web`)
- Prisma + PostgreSQL (`packages/db`) - sessions + operational overlay only
- Shared filter/search/mapping/CSV logic (`packages/shared`)
- pnpm 9.4 workspace (no Turborepo), TypeScript strict, Node 22.13+

## Repository layout

```
apps/
  web/        Shopify embedded app (auth, orders list/detail/print/CSV, settings, webhooks)
packages/
  db/         Prisma schema, migrations, client
  shared/     Filter schemas, Shopify search-query builder, order mapping, CSV, column defs
extensions/   Shopify app extensions (empty)
```

## Prerequisites

- Node.js >= 22.13 and pnpm 9.4 (`corepack enable`)
- PostgreSQL 14+
- A Shopify Partners account and a dev store
- Shopify CLI (`pnpm shopify` runs the bundled one)

No Redis or background worker is required.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure environment. Copy `.env.example` to `.env` in the repo root. For local
   development the only variable you need to set is:

   - `DATABASE_URL` - PostgreSQL connection string

   Everything else is optional locally: `shopify app dev` injects `SHOPIFY_API_KEY`,
   `SHOPIFY_API_SECRET` and `SHOPIFY_APP_URL`, and access scopes come from
   `[access_scopes]` in `shopify.app.toml`.

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
   `web_directories = ["apps/web"]`.

5. Request **protected customer data** access for your dev app in the Developer
   Dashboard (App > API access > Protected customer data access). Order payloads
   contain customer PII.

## Running locally

```bash
pnpm dev
```

That is the only process. Open the embedded app and the orders list reads live
from your dev store - no "Sync orders" step, no second terminal.

## Running tests, lint, typecheck

```bash
pnpm test         # vitest across all packages
pnpm lint         # eslint (web app)
pnpm typecheck    # tsc across all packages
```

Tests mock the database boundary; they run without PostgreSQL.

## Deployment

1. Provision PostgreSQL.
2. Set the production env vars listed in `.env.example`.
3. `pnpm install && pnpm run setup && pnpm build`
4. Run the web app: `pnpm --filter @order-operations/web run start`
5. Update the app URL and webhook endpoints in the Dev Dashboard to your production URL.

A Dockerfile for the web app is included.

## Notes on architecture

- Shopify remains the source of truth for orders. There is no order sync, no
  queue, and no local order index; list/detail/print/CSV views all query the
  Admin GraphQL API directly.
- Filtering and search use Shopify's native order search syntax
  (`financial_status:paid`, `fulfillment_status:unfulfilled`, `tag:...`,
  `created_at:>=...`, bare-term search across name/customer/email).
- Bulk actions run inline (tag add/remove go to Shopify via `tagsAdd`/
  `tagsRemove`; notes/COD/assignment update the local overlay) and are capped
  at 50 selected orders per action.
- CSV export is a synchronous download capped at 500 orders for the current
  filter set.
- The COD list filter was removed: it relied on the synced cache and cannot be
  expressed reliably in Shopify's order search syntax. COD status is still
  detected per order from the payment gateway and shown as a badge.
- Every query is shop-scoped; there is no cross-shop data path.
