// Synchronous CSV export of the current filter set, read live from Shopify.
// Capped so a huge result set cannot hang the web process; no worker needed.

import type { LoaderFunctionArgs } from "react-router";
import {
  buildLineItemsCsv,
  buildOrdersCsv,
  mapAdminOrderToListItem,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, workflowConfig } from "../services/settings.server";
import { fetchOrdersForExport, orderSearchContext } from "../services/shopify-orders.server";
import { parseOrdersPageParams } from "../lib/params";

export const CSV_EXPORT_LIMIT = 500;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const workflow = workflowConfig(settings);

  const url = new URL(request.url);
  const params = parseOrdersPageParams(url, settings.defaultColumns);
  // ?format=items exports one row per line item instead of one per order.
  const byLineItem = url.searchParams.get("format") === "items";

  const { orders: nodes } = await fetchOrdersForExport(admin, {
    filters: params.filters,
    sort: params.sort,
    context: await orderSearchContext(admin, session.shop, workflow),
    maxOrders: CSV_EXPORT_LIMIT,
  });
  const orders = nodes.map(mapAdminOrderToListItem);

  const options = {
    stages: workflow.stages,
    staff: workflow.staff,
    showInternal: workflow.showInternalProperties,
  };
  const csv = byLineItem ? buildLineItemsCsv(orders, options) : buildOrdersCsv(orders, options);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${byLineItem ? "order-items" : "orders"}-${stamp}.csv"`,
    },
  });
};
