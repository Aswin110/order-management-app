// Live Shopify Admin GraphQL access for orders. The app never stores order
// data locally: every list, detail, print, and CSV view reads from Shopify
// directly, with cursor pagination on the orders connection.

import type {
  AdminOrderNode,
  OrderFilters,
  OrderSearchContext,
  OrderSort,
} from "@order-operations/shared";
import { buildOrderSearchQuery, toShopifySort } from "@order-operations/shared";

interface AdminGraphql {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

const ORDER_FIELDS = `#graphql
  fragment OrderFields on Order {
    id
    name
    createdAt
    processedAt
    cancelledAt
    closed
    email
    phone
    displayFinancialStatus
    displayFulfillmentStatus
    currencyCode
    totalPriceSet { shopMoney { amount currencyCode } }
    subtotalPriceSet { shopMoney { amount } }
    totalDiscountsSet { shopMoney { amount } }
    totalShippingPriceSet { shopMoney { amount } }
    totalTaxSet { shopMoney { amount } }
    tags
    note
    paymentGatewayNames
    shippingLine { title }
    customer { displayName firstName lastName email phone }
    shippingAddress {
      name address1 address2 city provinceCode zip countryCodeV2 phone
    }
    lineItems(first: $lineItems) {
      nodes {
        id
        title
        variantTitle
        quantity
        sku
        vendor
        unfulfilledQuantity
        requiresShipping
        image { url altText }
        originalUnitPriceSet { shopMoney { amount } }
        discountedTotalSet { shopMoney { amount } }
        totalDiscountSet { shopMoney { amount } }
        customAttributes { key value }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const ORDERS_QUERY = `${ORDER_FIELDS}
#graphql
  query OrdersPage(
    $first: Int
    $after: String
    $last: Int
    $before: String
    $query: String
    $sortKey: OrderSortKeys
    $reverse: Boolean
    $lineItems: Int = 10
  ) {
    orders(
      first: $first
      after: $after
      last: $last
      before: $before
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      nodes { ...OrderFields }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }
`;

const ORDER_DETAILS_QUERY = `#graphql
  query OrderDetails($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      processedAt
      cancelledAt
      cancelReason
      closed
      email
      phone
      displayFinancialStatus
      displayFulfillmentStatus
      currencyCode
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      discountCodes
      fulfillments(first: 20) {
        id
        displayStatus
        createdAt
        deliveredAt
        totalQuantity
        trackingInfo(first: 5) { company number url }
      }
      refunds(first: 20) {
        id
        createdAt
        note
        totalRefundedSet { shopMoney { amount } }
      }
      tags
      note
      paymentGatewayNames
      shippingLine { title }
      customer { displayName firstName lastName email phone }
      shippingAddress {
        name address1 address2 city provinceCode zip countryCodeV2 phone
      }
      lineItems(first: 100) {
        nodes {
          id
          title
          variantTitle
          quantity
          sku
          vendor
          unfulfilledQuantity
          requiresShipping
          image { url altText }
          originalUnitPriceSet { shopMoney { amount } }
          discountedTotalSet { shopMoney { amount } }
          totalDiscountSet { shopMoney { amount } }
          customAttributes { key value }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

const SHOP_TIME_ZONE_QUERY = `#graphql
  query ShopTimeZone {
    shop { ianaTimezone }
  }
`;

const ORDERS_BY_IDS_QUERY = `${ORDER_FIELDS}
#graphql
  query OrdersByIds($ids: [ID!]!, $lineItems: Int = 10) {
    nodes(ids: $ids) {
      ... on Order { ...OrderFields }
    }
  }
`;

export interface OrderPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface OrdersPage {
  orders: AdminOrderNode[];
  pageInfo: OrderPageInfo;
  searchQuery: string | null;
}

async function readGraphql<T>(response: Response): Promise<T> {
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (body.errors?.length) {
    throw new Error(
      body.errors.map((e) => e.message ?? "Unknown GraphQL error").join("; "),
    );
  }
  if (!body.data) throw new Error("Shopify returned no data");
  return body.data;
}

// A shop's timezone almost never changes; one lookup an hour per shop keeps
// it off the hot path without storing it.
const TIME_ZONE_TTL_MS = 60 * 60 * 1000;
const timeZoneCache = new Map<string, { timeZone: string; expires: number }>();

/** The shop's IANA timezone, so "today" means the shop's day rather than UTC's. */
export async function getShopTimeZone(admin: AdminGraphql, shopDomain: string): Promise<string> {
  const cached = timeZoneCache.get(shopDomain);
  if (cached && cached.expires > Date.now()) return cached.timeZone;
  try {
    const data = await readGraphql<{ shop: { ianaTimezone?: string | null } }>(
      await admin.graphql(SHOP_TIME_ZONE_QUERY),
    );
    const timeZone = data.shop.ianaTimezone || "UTC";
    timeZoneCache.set(shopDomain, { timeZone, expires: Date.now() + TIME_ZONE_TTL_MS });
    return timeZone;
  } catch {
    // A date filter that is a few hours off beats a page that fails to load.
    return cached?.timeZone ?? "UTC";
  }
}

/** Everything the search query builder needs to know about the shop. */
export async function orderSearchContext(
  admin: AdminGraphql,
  shopDomain: string,
  workflow: { stages: string[]; staff: string[] },
): Promise<OrderSearchContext> {
  return {
    timeZone: await getShopTimeZone(admin, shopDomain),
    stages: workflow.stages,
    staff: workflow.staff,
  };
}

/** Line items fetched per order when every item matters (exports, print). */
export const ALL_LINE_ITEMS = 50;

/** One page of live orders from the Shopify Admin API. */
export async function fetchOrdersPage(
  admin: AdminGraphql,
  options: {
    filters: OrderFilters;
    sort: OrderSort;
    pageSize: number;
    cursor?: string | null;
    direction?: "forward" | "backward";
    context?: OrderSearchContext;
    lineItems?: number;
  },
): Promise<OrdersPage> {
  const searchQuery = buildOrderSearchQuery(options.filters, options.context) ?? null;
  const { sortKey, reverse } = toShopifySort(options.sort);
  const first = Math.min(Math.max(options.pageSize, 1), 250);

  const variables: Record<string, unknown> = {
    query: searchQuery,
    sortKey,
    reverse,
  };
  if (options.lineItems) variables.lineItems = options.lineItems;
  if (options.direction === "backward" && options.cursor) {
    variables.last = first;
    variables.before = options.cursor;
  } else {
    variables.first = first;
    if (options.cursor) variables.after = options.cursor;
  }

  const data = await readGraphql<{
    orders: {
      nodes: AdminOrderNode[];
      pageInfo: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        startCursor?: string | null;
        endCursor?: string | null;
      };
    };
  }>(await admin.graphql(ORDERS_QUERY, { variables }));

  return {
    orders: data.orders.nodes,
    pageInfo: {
      hasNextPage: data.orders.pageInfo.hasNextPage,
      hasPreviousPage: data.orders.pageInfo.hasPreviousPage,
      startCursor: data.orders.pageInfo.startCursor ?? null,
      endCursor: data.orders.pageInfo.endCursor ?? null,
    },
    searchQuery,
  };
}

/** One order, live, with up to 100 line items. */
export async function fetchOrderDetails(
  admin: AdminGraphql,
  shopifyOrderId: string,
): Promise<AdminOrderNode | null> {
  const data = await readGraphql<{ order: AdminOrderNode | null }>(
    await admin.graphql(ORDER_DETAILS_QUERY, { variables: { id: shopifyOrderId } }),
  );
  return data.order;
}

/** Specific orders by Shopify GID (print view). Order is preserved. */
export async function fetchOrdersByIds(
  admin: AdminGraphql,
  shopifyOrderIds: string[],
): Promise<AdminOrderNode[]> {
  if (!shopifyOrderIds.length) return [];
  const data = await readGraphql<{ nodes: Array<AdminOrderNode | null> }>(
    await admin.graphql(ORDERS_BY_IDS_QUERY, {
      variables: { ids: shopifyOrderIds, lineItems: ALL_LINE_ITEMS },
    }),
  );
  const byId = new Map(
    data.nodes.filter((n): n is AdminOrderNode => Boolean(n?.id)).map((n) => [n.id, n]),
  );
  return shopifyOrderIds.map((id) => byId.get(id)).filter((n): n is AdminOrderNode => Boolean(n));
}

/**
 * Pages through all orders matching the filters for an export or the
 * production summary, capped so a huge result set cannot hang the web
 * process. `truncated` says the cap cut the result short.
 */
export async function fetchOrdersForExport(
  admin: AdminGraphql,
  options: {
    filters: OrderFilters;
    sort: OrderSort;
    context?: OrderSearchContext;
    maxOrders?: number;
  },
): Promise<{ orders: AdminOrderNode[]; truncated: boolean }> {
  const max = options.maxOrders ?? 500;
  const collected: AdminOrderNode[] = [];
  let cursor: string | null = null;
  let hasMore = false;

  while (collected.length < max) {
    const page = await fetchOrdersPage(admin, {
      filters: options.filters,
      sort: options.sort,
      pageSize: 100,
      cursor,
      direction: "forward",
      context: options.context,
      lineItems: ALL_LINE_ITEMS,
    });
    collected.push(...page.orders);
    hasMore = page.pageInfo.hasNextPage && Boolean(page.pageInfo.endCursor);
    if (!hasMore) break;
    cursor = page.pageInfo.endCursor;
  }
  return { orders: collected.slice(0, max), truncated: hasMore || collected.length > max };
}
