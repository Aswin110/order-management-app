# syntax=docker/dockerfile:1
FROM node:22-slim

ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @order-operations/db run generate
RUN pnpm --filter @order-operations/web run build

EXPOSE 3000
# Applies migrations, then serves the embedded app. Run the worker as a
# second process with: pnpm --filter @order-operations/worker run start
CMD ["sh", "-c", "pnpm db:migrate && pnpm --filter @order-operations/web run start"]
