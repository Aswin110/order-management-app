// Loads the repo-root .env so the Prisma CLI (generate/migrate) sees
// DATABASE_URL when run from this package.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
