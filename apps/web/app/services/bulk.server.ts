import type { OrderFilters, OrderSort, BulkActionPayload } from "@order-operations/shared";
import prisma from "../db.server";
import { enqueueBulkAction } from "./queues.server";
import { buildOrderWhere } from "./orders/query.server";

export const MAX_INLINE_BULK = 50;

/**
 * Queue a bulk action for explicitly selected orders. The worker applies
 * it in the background so the browser never blocks on hundreds of orders.
 */
export async function applyBulkAction(options: {
  shopId: string;
  shopDomain: string;
  shopifyOrderIds: string[];
  action: BulkActionPayload;
  requestedById?: string;
}) {
  if (!options.shopifyOrderIds.length) throw new Error("No orders selected");
  if (options.shopifyOrderIds.length > 2000) {
    throw new Error("Too many orders selected (max 2000 per bulk action)");
  }
  await enqueueBulkAction({
    shopId: options.shopId,
    shopDomain: options.shopDomain,
    shopifyOrderIds: options.shopifyOrderIds,
    action: options.action,
    requestedById: options.requestedById,
  });
  return { queued: options.shopifyOrderIds.length };
}

/** Resolve the order ids matching a filter set (used for "select all matching"). */
export async function resolveFilteredOrderIds(options: {
  shopId: string;
  filters: OrderFilters;
  sort: OrderSort;
  highValueThreshold: number | string;
  limit?: number;
}) {
  const where = buildOrderWhere(options.shopId, options.filters, options.highValueThreshold);
  const rows = await prisma.orderMetadata.findMany({
    where,
    select: { shopifyOrderId: true },
    take: options.limit ?? 2000,
  });
  return rows.map((r) => r.shopifyOrderId);
}
