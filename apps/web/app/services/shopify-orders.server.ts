// Live Shopify Admin GraphQL access for orders. The app never stores order
// data locally: every list, detail, print, and CSV view reads from Shopify
// directly, with cursor pagination on the orders connection.

import type { AdminOrderNode, OrderFilters, OrderSort } from "@order-operations/shared";
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
    customer { displayName firstName lastName email phone }
    shippingAddress {
      name address1 address2 city provinceCode zip countryCodeV2 phone
    }
    lineItems(first: 10) {
      nodes {
        id
        title
        variantTitle
        quantity
        sku
        image { url altText }
        originalUnitPriceSet { shopMoney { amount } }
        discountedTotalSet { shopMoney { amount } }
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
          image { url altText }
          originalUnitPriceSet { shopMoney { amount } }
          discountedTotalSet { shopMoney { amount } }
          customAttributes { key value }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

const ORDERS_BY_IDS_QUERY = `${ORDER_FIELDS}
#graphql
  query OrdersByIds($ids: [ID!]!) {
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

/** One page of live orders from the Shopify Admin API. */
export async function fetchOrdersPage(
  admin: AdminGraphql,
  options: {
    filters: OrderFilters;
    sort: OrderSort;
    pageSize: number;
    cursor?: string | null;
    direction?: "forward" | "backward";
  },
): Promise<OrdersPage> {
  const searchQuery = buildOrderSearchQuery(options.filters) ?? null;
  const { sortKey, reverse } = toShopifySort(options.sort);
  const first = Math.min(Math.max(options.pageSize, 1), 250);

  const variables: Record<string, unknown> = {
    query: searchQuery,
    sortKey,
    reverse,
  };
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
    await admin.graphql(ORDERS_BY_IDS_QUERY, { variables: { ids: shopifyOrderIds } }),
  );
  const byId = new Map(
    data.nodes.filter((n): n is AdminOrderNode => Boolean(n?.id)).map((n) => [n.id, n]),
  );
  return shopifyOrderIds.map((id) => byId.get(id)).filter((n): n is AdminOrderNode => Boolean(n));
}

/**
 * Pages through all orders matching the filters for CSV export, capped so a
 * huge result set cannot hang the web process.
 */
export async function fetchOrdersForCsv(
  admin: AdminGraphql,
  options: { filters: OrderFilters; sort: OrderSort; maxOrders?: number },
): Promise<AdminOrderNode[]> {
  const max = options.maxOrders ?? 500;
  const collected: AdminOrderNode[] = [];
  let cursor: string | null = null;

  while (collected.length < max) {
    const page = await fetchOrdersPage(admin, {
      filters: options.filters,
      sort: options.sort,
      pageSize: 100,
      cursor,
      direction: "forward",
    });
    collected.push(...page.orders);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }
  return collected.slice(0, max);
}
