// Synchronous CSV export of the current filter set, read live from Shopify.
// Capped so a huge result set cannot hang the web process; no worker needed.

import type { LoaderFunctionArgs } from "react-router";
import { buildOrdersCsv, mapAdminOrderToListItem } from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings } from "../services/settings.server";
import { fetchOrdersForCsv } from "../services/shopify-orders.server";
import { getOrderOverlays } from "../services/overlay.server";
import { parseOrdersPageParams } from "../lib/params";

export const CSV_EXPORT_LIMIT = 500;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);

  const url = new URL(request.url);
  const params = parseOrdersPageParams(url, settings.defaultColumns);

  const nodes = await fetchOrdersForCsv(admin, {
    filters: params.filters,
    sort: params.sort,
    maxOrders: CSV_EXPORT_LIMIT,
  });
  const overlays = await getOrderOverlays(shop.id, nodes.map((n) => n.id));
  const orders = nodes.map((n) => mapAdminOrderToListItem(n, overlays.get(n.id) ?? null));

  const csv = buildOrdersCsv(orders);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${stamp}.csv"`,
    },
  });
};
