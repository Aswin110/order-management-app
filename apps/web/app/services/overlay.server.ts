import prisma from "../db.server";
import type { OrderOpsOverlayData } from "@order-operations/shared";

/**
 * App-internal overlay for a Shopify order (COD status, staff assignment,
 * note preview). Created lazily on first write - order data itself always
 * comes live from Shopify, so there is nothing to sync.
 */
export async function getOrCreateOverlay(shopId: string, shopifyOrderId: string) {
  return prisma.orderOpsMeta.upsert({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
    create: { shopId, shopifyOrderId },
    update: {},
  });
}

type OverlayRow = {
  shopifyOrderId: string;
  codStatus: string;
  assignedStaffId: string | null;
  notesCount: number;
  latestNote: string | null;
  assignedStaff?: { name: string } | null;
};

function toOverlayData(row: OverlayRow): OrderOpsOverlayData {
  return {
    codStatus: row.codStatus,
    assignedStaffId: row.assignedStaffId,
    assignedStaffName: row.assignedStaff?.name ?? null,
    notesCount: row.notesCount,
    latestNote: row.latestNote,
  };
}

/** Batch-load overlays for one page of Shopify order ids (one indexed query). */
export async function getOrderOverlays(
  shopId: string,
  shopifyOrderIds: string[],
): Promise<Map<string, OrderOpsOverlayData>> {
  if (!shopifyOrderIds.length) return new Map();
  const rows = await prisma.orderOpsMeta.findMany({
    where: { shopId, shopifyOrderId: { in: shopifyOrderIds } },
    include: { assignedStaff: { select: { name: true } } },
  });
  return new Map(rows.map((row) => [row.shopifyOrderId, toOverlayData(row)]));
}

export async function getOrderOverlay(
  shopId: string,
  shopifyOrderId: string,
): Promise<OrderOpsOverlayData | null> {
  const row = await prisma.orderOpsMeta.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
    include: { assignedStaff: { select: { name: true } } },
  });
  return row ? toOverlayData(row) : null;
}
