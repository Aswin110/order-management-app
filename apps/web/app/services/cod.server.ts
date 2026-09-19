import type { CodStatus } from "@prisma/client";
import prisma from "../db.server";

const VALID: CodStatus[] = ["NOT_COD", "PENDING", "VERIFIED", "FAILED", "CANCELLED"];

export function isValidCodStatus(value: string): value is CodStatus {
  return (VALID as string[]).includes(value);
}

/**
 * Manually set the COD verification status for one order, scoped to the
 * shop. Structured so a WhatsApp (or other) provider can hook in later -
 * e.g. notify on status change - without changing this API.
 */
export async function setCodStatus(options: {
  shopId: string;
  shopifyOrderId: string;
  codStatus: CodStatus;
}) {
  const { shopId, shopifyOrderId, codStatus } = options;
  if (!isValidCodStatus(codStatus)) {
    throw new Error(`Invalid COD status: ${codStatus}`);
  }
  const order = await prisma.orderMetadata.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
  });
  if (!order) {
    throw new Error("Order not found. It may not have synced yet.");
  }
  return prisma.orderMetadata.update({
    where: { id: order.id },
    data: { codStatus },
  });
}
