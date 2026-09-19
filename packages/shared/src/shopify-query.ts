import type { OrderFilters, OrderSort } from "./filters";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function quoteTerm(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // Bare terms are fine for single tokens; spaces and special chars need quotes.
  return /^[\w@.+#-]+$/.test(value) ? escaped : `"${escaped}"`;
}

const FULFILLMENT_TERMS: Record<string, string> = {
  FULFILLED: "fulfillment_status:fulfilled",
  UNFULFILLED: "fulfillment_status:unfulfilled",
  PARTIALLY_FULFILLED: "fulfillment_status:partial",
};

const FINANCIAL_TERMS: Record<string, string> = {
  PAID: "financial_status:paid",
  PENDING: "financial_status:pending",
  AUTHORIZED: "financial_status:authorized",
  REFUNDED: "financial_status:refunded",
};

/**
 * Translates order filters into a Shopify Admin API order search query
 * string. Returns undefined when no terms apply (unfiltered list).
 * Pure and unit-tested; the same string drives the list page, CSV export,
 * and print views.
 */
export function buildOrderSearchQuery(filters: OrderFilters): string | undefined {
  const parts: string[] = [];

  const fulfillment = FULFILLMENT_TERMS[filters.fulfillment];
  if (fulfillment) parts.push(fulfillment);

  const financial = FINANCIAL_TERMS[filters.financial];
  if (financial) parts.push(financial);

  if (filters.tag) parts.push(`tag:${quoteTerm(filters.tag)}`);

  if (filters.dateRange === "TODAY") {
    parts.push(`created_at:>=${isoDay(startOfTodayUtc())}`);
  } else if (filters.dateRange === "LAST_7_DAYS") {
    parts.push(`created_at:>=${isoDay(daysAgo(7))}`);
  } else if (filters.dateRange === "LAST_30_DAYS") {
    parts.push(`created_at:>=${isoDay(daysAgo(30))}`);
  }

  const search = filters.search?.trim();
  if (search) {
    // A bare term is a case-insensitive search across order name, customer,
    // email, and other default fields (Shopify search syntax).
    parts.push(quoteTerm(search));
  }

  return parts.length ? parts.join(" ") : undefined;
}

const SORT_KEYS = {
  name: "ORDER_NUMBER",
  orderedAt: "CREATED_AT",
  totalPrice: "TOTAL_PRICE",
} as const;

export type ShopifyOrderSortKey = (typeof SORT_KEYS)[keyof typeof SORT_KEYS];

/** Maps our sort model to the orders(sortKey:, reverse:) arguments. */
export function toShopifySort(sort: OrderSort): {
  sortKey: ShopifyOrderSortKey;
  reverse: boolean;
} {
  return {
    sortKey: SORT_KEYS[sort.column] ?? "CREATED_AT",
    // Shopify returns descending order by default; reverse gives ascending.
    reverse: sort.direction === "asc",
  };
}
