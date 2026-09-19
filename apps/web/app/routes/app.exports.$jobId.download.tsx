import type { LoaderFunctionArgs } from "react-router";
import * as fs from "node:fs/promises";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getExportJob } from "../services/export.server";

// Streams a completed CSV export. Shop-scoped: a merchant can only ever
// reach their own shop's export jobs.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const job = await getExportJob(shop.id, params.jobId ?? "");
  if (!job || job.status !== "COMPLETED" || !job.filePath) {
    return new Response("Export not found or not ready", { status: 404 });
  }

  let contents: string;
  try {
    contents = await fs.readFile(job.filePath, "utf8");
  } catch {
    return new Response("Export file is no longer available", { status: 410 });
  }

  return new Response(contents, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${job.id}.csv"`,
    },
  });
};
