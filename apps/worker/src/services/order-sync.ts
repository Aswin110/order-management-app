import { prisma, Prisma } from "@order-operations/db";
import { mapShopifyOrder, type MappedOrder } from "@order-operations/shared";
import { adminGraphql } from "./shopify-admin";

// Orders are synced in pages; we never load thousands of orders in one request.
const ORDERS_PAGE_SIZE = 50;

const ORDERS_QUERY = `#graphql
  query SyncOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        email
        phone
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        totalPriceSet { shopMoney { amount } }
        tags
        paymentGatewayNames
        riskLevel
        customer {
          displayName
          email
          phone
        }
        lineItems(first: 250) { nodes { id } }
        shippingAddress {
          address1 address2 city provinceCode zip countryCodeV2
        }
      }
    }
  }
`;

interface OrdersPage {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<Record<string, unknown>>;
  };
}

export interface SyncResult {
  synced: number;
  pages: number;
}

/**
 * Background order sync. Fetches orders from Shopify in pages and upserts
 * the indexed OrderMetadata rows. Safe to re-run: upserts are idempotent.
 */
export async function syncShopOrders(options: {
  shopId: string;
  shopDomain: string;
  accessToken: string;
  since?: string;
}): Promise<SyncResult> {
  let cursor: string | null = null;
  let synced = 0;
  let pages = 0;
  const queryFilter = options.since ? `updated_at:>=${options.since}` : undefined;

  do {
    const data: OrdersPage = await adminGraphql<OrdersPage>(
      { shopDomain: options.shopDomain, accessToken: options.accessToken },
      ORDERS_QUERY,
      { first: ORDERS_PAGE_SIZE, after: cursor, query: queryFilter ?? null },
    );

    for (const node of data.orders.nodes) {
      await upsertOrderNode(options.shopId, node);
      synced++;
    }
    pages++;
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor);

  return { synced, pages };
}

function toPrismaData(mapped: MappedOrder) {
  return {
    name: mapped.name,
    orderedAt: mapped.orderedAt,
    customerName: mapped.customerName,
    email: mapped.email,
    phone: mapped.phone,
    financialStatus: mapped.financialStatus,
    fulfillmentStatus: mapped.fulfillmentStatus,
    totalPrice: mapped.totalPrice ? new Prisma.Decimal(mapped.totalPrice) : null,
    currency: mapped.currency,
    itemCount: mapped.itemCount,
    tags: mapped.tags,
    riskLevel: mapped.riskLevel,
    shippingAddress: mapped.shippingAddress
      ? (mapped.shippingAddress as Prisma.InputJsonValue)
      : undefined,
    cancelledAt: mapped.cancelledAt,
    syncedAt: new Date(),
  };
}

async function upsertOrderNode(shopId: string, node: Record<string, unknown>) {
  const shopifyOrderId = String(node.id);
  const prior = await prisma.orderMetadata.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
    select: { codStatus: true },
  });
  const mapped = mapShopifyOrder(node as never, prior?.codStatus);
  await prisma.orderMetadata.upsert({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
    create: { shopId, ...toPrismaData(mapped), shopifyOrderId, codStatus: mapped.codStatus },
    update: { ...toPrismaData(mapped), codStatus: mapped.codStatus },
  });
}
