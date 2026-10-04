// Production summary: what still has to be made across a set of orders,
// grouped so identical work (same product, variant and personalisation) is
// one line with a total. Pure, so it is unit-tested without Shopify.

import type { AdminLineItemCustomAttribute, OrderListItem } from "./admin-orders";
import { visibleAttributes } from "./properties";

export interface ProductionRow {
  key: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  vendor: string | null;
  imageUrl: string | null;
  customizations: AdminLineItemCustomAttribute[];
  /** Units still to make across all the orders in the row. */
  quantity: number;
  /** Order names, in the order they were given. */
  orders: string[];
}

export interface ProductionSummary {
  rows: ProductionRow[];
  totalUnits: number;
  /** Orders with at least one unit still to make. */
  orderCount: number;
}

export function buildProductionSummary(
  orders: OrderListItem[],
  options: { showInternal?: boolean } = {},
): ProductionSummary {
  const rows = new Map<string, ProductionRow>();
  let orderCount = 0;

  for (const order of orders) {
    if (order.cancelledAt) continue;
    let orderHasWork = false;

    for (const item of order.items) {
      // Fulfilled lines are done; digital goods need no production.
      if (item.unfulfilledQuantity <= 0 || !item.requiresShipping) continue;
      orderHasWork = true;

      const customizations = visibleAttributes(item.customAttributes, options.showInternal);
      const key = JSON.stringify([
        item.title,
        item.variantTitle,
        item.sku,
        customizations.map((a) => [a.key, a.value]),
      ]);

      const row = rows.get(key);
      if (row) {
        row.quantity += item.unfulfilledQuantity;
        if (!row.orders.includes(order.name)) row.orders.push(order.name);
      } else {
        rows.set(key, {
          key,
          title: item.title,
          variantTitle: item.variantTitle,
          sku: item.sku,
          vendor: item.vendor,
          imageUrl: item.imageUrl,
          customizations,
          quantity: item.unfulfilledQuantity,
          orders: [order.name],
        });
      }
    }

    if (orderHasWork) orderCount += 1;
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      a.title.localeCompare(b.title) ||
      (a.variantTitle ?? "").localeCompare(b.variantTitle ?? "") ||
      b.quantity - a.quantity,
  );

  return {
    rows: sorted,
    totalUnits: sorted.reduce((sum, r) => sum + r.quantity, 0),
    orderCount,
  };
}
