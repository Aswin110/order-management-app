import type { OrderFilters, OrderSort } from "./filters";
import { COD_GATEWAY_NAMES } from "./cod";
import { WORKFLOW_NONE, slugify, workflowTag, type WorkflowGroup } from "./workflow";

/** What the query builder needs to know about the shop, beyond the filters. */
export interface OrderSearchContext {
  /** The shop's IANA timezone. Date filters are whole days in this zone. */
  timeZone?: string;
  /** Overridable clock, for tests. */
  now?: Date;
  /** Configured stage and staff labels, needed to express "no stage" / "unassigned". */
  stages?: readonly string[];
  staff?: readonly string[];
  /** Raw search terms ANDed onto the query. */
  extraTerms?: readonly string[];
}

/** The zone's UTC offset at the given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar day (YYYY-MM-DD) it is in the zone at the given instant. */
function dayInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant at which the calendar day starts in the zone. */
function startOfDay(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, m - 1, d);
  // On a DST change day the offset at local midnight differs from the offset
  // at UTC midnight, so resolve it twice.
  let instant = asUtc - zoneOffsetMs(new Date(asUtc), timeZone);
  instant = asUtc - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function createdAtTerm(comparator: ">=" | "<", instant: Date): string {
  // Shopify only parses a full timestamp when it is quoted.
  return `created_at:${comparator}'${instant.toISOString().replace(/\.\d{3}Z$/, "Z")}'`;
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

const STATUS_TERMS: Record<string, string> = {
  OPEN: "status:open",
  CLOSED: "status:closed",
  CANCELLED: "status:cancelled",
};

const DELIVERY_TERMS: Record<string, string> = {
  SHIPPING: "delivery_method:shipping",
  LOCAL: "delivery_method:local",
  PICK_UP: "delivery_method:pick-up",
  PICKUP_POINT: "delivery_method:pickup-point",
  RETAIL: "delivery_method:retail",
  NONE: "delivery_method:none",
};

function paymentTerm(payment: OrderFilters["payment"]): string | undefined {
  const gateways = COD_GATEWAY_NAMES.map((name) => `gateway:${quoteTerm(name)}`);
  if (payment === "COD") return `(${gateways.join(" OR ")})`;
  if (payment === "PREPAID") return gateways.map((g) => `-${g}`).join(" ");
  return undefined;
}

/**
 * Terms for a workflow filter: one tag for a specific value, or the absence
 * of every configured value for "none".
 */
function workflowTerms(
  group: WorkflowGroup,
  value: string | undefined,
  labels: readonly string[],
): string[] {
  if (!value) return [];
  if (value === WORKFLOW_NONE) {
    return labels.map((label) => `tag_not:${quoteTerm(workflowTag(group, label))}`);
  }
  const slug = slugify(value);
  return slug ? [`tag:${quoteTerm(workflowTag(group, slug))}`] : [];
}

function dateTerms(filters: OrderFilters, context: OrderSearchContext): string[] {
  const timeZone = context.timeZone ?? "UTC";
  const today = dayInZone(context.now ?? new Date(), timeZone);
  const since = (day: string) => createdAtTerm(">=", startOfDay(day, timeZone));

  switch (filters.dateRange) {
    case "TODAY":
      return [since(today)];
    case "LAST_7_DAYS":
      return [since(addDays(today, -7))];
    case "LAST_30_DAYS":
      return [since(addDays(today, -30))];
    case "CUSTOM": {
      const terms: string[] = [];
      if (filters.dateFrom) terms.push(since(filters.dateFrom));
      if (filters.dateTo) {
        // dateTo is inclusive: everything before the start of the next day.
        terms.push(createdAtTerm("<", startOfDay(addDays(filters.dateTo, 1), timeZone)));
      }
      return terms;
    }
    default:
      return [];
  }
}

/**
 * Translates order filters into a Shopify Admin API order search query
 * string. Returns undefined when no terms apply (unfiltered list).
 * Pure and unit-tested; the same string drives the list page, CSV export,
 * production summary, and print views.
 */
export function buildOrderSearchQuery(
  filters: OrderFilters,
  context: OrderSearchContext = {},
): string | undefined {
  const parts: string[] = [];

  const fulfillment = FULFILLMENT_TERMS[filters.fulfillment];
  if (fulfillment) parts.push(fulfillment);

  const financial = FINANCIAL_TERMS[filters.financial];
  if (financial) parts.push(financial);

  const status = STATUS_TERMS[filters.status];
  if (status) parts.push(status);

  const payment = paymentTerm(filters.payment);
  if (payment) parts.push(payment);

  const delivery = DELIVERY_TERMS[filters.delivery];
  if (delivery) parts.push(delivery);

  if (filters.tag) parts.push(`tag:${quoteTerm(filters.tag)}`);
  if (filters.tagNot) parts.push(`tag_not:${quoteTerm(filters.tagNot)}`);
  if (filters.sku) parts.push(`sku:${quoteTerm(filters.sku)}`);

  parts.push(...workflowTerms("stage", filters.stage, context.stages ?? []));
  parts.push(...workflowTerms("assignee", filters.assignee, context.staff ?? []));

  parts.push(...dateTerms(filters, context));
  parts.push(...(context.extraTerms ?? []));

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
    // Shopify returns ascending order by default; reverse gives descending.
    reverse: sort.direction === "desc",
  };
}
