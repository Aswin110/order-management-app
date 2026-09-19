import type { CodStatus } from "@prisma/client";
import prisma from "../db.server";

const VALID: CodStatus[] = ["NOT_COD", "PENDING", "VERIFIED", "FAILED", "CANCELLED"];

export function isValidCodStatus(value: string): value is CodStatus {
  return (VALID as string[]).includes(value);
}

/**
 * Manually set the COD verification status for one order, scoped to the
 * shop. The overlay row is created on first use - the order never needs
 * to be "synced" first.
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
  return prisma.orderOpsMeta.upsert({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
    create: { shopId, shopifyOrderId, codStatus },
    update: { codStatus },
  });
}
