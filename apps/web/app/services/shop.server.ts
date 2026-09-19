import prisma from "../db.server";

/** Upsert the Shop row for an installed shop domain. */
export async function ensureShop(shopDomain: string, scope?: string | null) {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain, scope: scope ?? null },
    update: scope ? { scope } : {},
  });
}

export async function getShopByDomain(shopDomain: string) {
  return prisma.shop.findUnique({ where: { shopDomain } });
}
