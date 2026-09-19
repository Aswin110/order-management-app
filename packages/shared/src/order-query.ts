import { Prisma, prisma } from "@order-operations/db";
import type { OrderFilters, OrderSort } from "./filters";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Builds the Prisma where clause for an order filter set. Pure + exported for tests. */
export function buildOrderWhere(
  shopId: string,
  filters: OrderFilters,
  highValueThreshold: Prisma.Decimal | number | string,
): Prisma.OrderMetadataWhereInput {
  const where: Prisma.OrderMetadataWhereInput = { shopId };

  if (filters.fulfillment === "FULFILLED") {
    where.fulfillmentStatus = "FULFILLED";
  } else if (filters.fulfillment === "UNFULFILLED") {
    where.OR = [
      { fulfillmentStatus: "UNFULFILLED" },
      { fulfillmentStatus: "PARTIALLY_FULFILLED" },
      { fulfillmentStatus: null },
    ];
  }

  if (filters.financial === "PAID") {
    where.financialStatus = "PAID";
  } else if (filters.financial === "PENDING") {
    where.financialStatus = { in: ["PENDING", "AUTHORIZED"] };
  }

  if (filters.cod === "COD") {
    where.codStatus = { in: ["PENDING", "VERIFIED", "FAILED"] };
  } else if (filters.cod === "COD_PENDING") {
    where.codStatus = "PENDING";
  } else if (filters.cod === "COD_VERIFIED") {
    where.codStatus = "VERIFIED";
  } else if (filters.cod === "NOT_COD") {
    where.codStatus = "NOT_COD";
  }

  if (filters.highValueOnly) {
    where.totalPrice = { gte: new Prisma.Decimal(highValueThreshold) };
  }
  if (filters.hasNotes) {
    where.notesCount = { gt: 0 };
  }
  if (filters.hasTags) {
    where.tags = { isEmpty: false };
  }
  if (filters.tag) {
    where.tags = { has: filters.tag };
  }
  if (filters.assigned === "ASSIGNED") {
    where.assignedStaffId = { not: null };
  } else if (filters.assigned === "UNASSIGNED") {
    where.assignedStaffId = null;
  }
  if (filters.staffId) {
    where.assignedStaffId = filters.staffId;
  }

  if (filters.dateRange === "TODAY") {
    where.orderedAt = { gte: startOfToday() };
  } else if (filters.dateRange === "LAST_7_DAYS") {
    where.orderedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  } else if (filters.dateRange === "LAST_30_DAYS") {
    where.orderedAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }

  const search = filters.search?.trim();
  if (search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { customerName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  return where;
}

const SORTABLE_COLUMNS = new Set(["name", "orderedAt", "customerName", "totalPrice", "itemCount"]);

export function buildOrderBy(sort: OrderSort): Prisma.OrderMetadataOrderByWithRelationInput[] {
  const column = SORTABLE_COLUMNS.has(sort.column) ? sort.column : "orderedAt";
  return [{ [column]: sort.direction }, { id: sort.direction }];
}

export type OrderWithStaff = Prisma.OrderMetadataGetPayload<{
  include: { assignedStaff: { select: { id: true; name: true } } };
}>;

export interface OrderPage {
  orders: OrderWithStaff[];
  nextCursor: string | null;
  previousCursor: string | null;
  totalCount: number;
}

/** Cursor-paginated order query. Never loads the full table. */
export async function queryOrders(options: {
  shopId: string;
  filters: OrderFilters;
  sort: OrderSort;
  highValueThreshold: Prisma.Decimal | number | string;
  cursor?: string | null;
  direction?: "forward" | "backward";
  pageSize: number;
}): Promise<OrderPage> {
  const { shopId, filters, sort, highValueThreshold, cursor, direction = "forward", pageSize } = options;
  const where = buildOrderWhere(shopId, filters, highValueThreshold);
  const orderBy = buildOrderBy(sort);

  const [totalCount, rows] = await Promise.all([
    prisma.orderMetadata.count({ where }),
    prisma.orderMetadata.findMany({
      where,
      orderBy,
      take: direction === "forward" ? pageSize + 1 : -(pageSize + 1),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { assignedStaff: { select: { id: true, name: true } } },
    }),
  ]);

  let orders = rows;
  let hasMore = orders.length > pageSize;
  if (hasMore) orders = orders.slice(0, pageSize);
  if (direction === "backward") orders = orders.reverse();

  return {
    orders,
    nextCursor: hasMore ? orders[orders.length - 1]?.id ?? null : null,
    previousCursor: cursor ? orders[0]?.id ?? null : null,
    totalCount,
  };
}
