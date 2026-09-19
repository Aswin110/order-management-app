import { Prisma } from "@prisma/client";
import prisma from "../db.server";

export interface DashboardMetrics {
  todayOrders: number;
  todayRevenue: string;
  unfulfilled: number;
  codPending: number;
  highValue: number;
}

/** Dashboard summary counts computed from indexed Shopify order data. */
export async function getDashboardMetrics(
  shopId: string,
  highValueThreshold: Prisma.Decimal | number | string,
): Promise<DashboardMetrics> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [todayOrders, revenueAgg, unfulfilled, codPending, highValue] = await Promise.all([
    prisma.orderMetadata.count({ where: { shopId, orderedAt: { gte: startOfDay } } }),
    prisma.orderMetadata.aggregate({
      where: { shopId, orderedAt: { gte: startOfDay } },
      _sum: { totalPrice: true },
    }),
    prisma.orderMetadata.count({
      where: {
        shopId,
        OR: [
          { fulfillmentStatus: "UNFULFILLED" },
          { fulfillmentStatus: "PARTIALLY_FULFILLED" },
          { fulfillmentStatus: null },
        ],
      },
    }),
    prisma.orderMetadata.count({ where: { shopId, codStatus: "PENDING" } }),
    prisma.orderMetadata.count({
      where: { shopId, totalPrice: { gte: new Prisma.Decimal(highValueThreshold) } },
    }),
  ]);

  return {
    todayOrders,
    todayRevenue: revenueAgg._sum.totalPrice?.toString() ?? "0",
    unfulfilled,
    codPending,
    highValue,
  };
}
