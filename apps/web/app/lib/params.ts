import {
  orderFiltersSchema,
  defaultOrderFilters,
  sortSchema,
  DEFAULT_COLUMNS,
  ORDER_COLUMNS,
  type OrderFilters,
  type OrderSort,
  type OrderColumnId,
} from "@order-operations/shared";

const COLUMN_IDS = new Set(ORDER_COLUMNS.map((c) => c.id));

export interface OrdersPageParams {
  filters: OrderFilters;
  sort: OrderSort;
  columns: OrderColumnId[];
  cursor: string | null;
  direction: "forward" | "backward";
}

/**
 * Filters stored on a saved view, brought up to the current shape. Views
 * saved before a filter existed lack its key, so defaults are filled in.
 */
export function normalizeFilters(stored: unknown): OrderFilters {
  const parsed = orderFiltersSchema.safeParse(stored);
  return parsed.success ? parsed.data : defaultOrderFilters;
}

export function parseOrdersPageParams(
  url: URL,
  defaultColumns: string[],
): OrdersPageParams {
  const p = url.searchParams;

  const filters = orderFiltersSchema.parse({
    fulfillment: p.get("fulfillment") ?? undefined,
    financial: p.get("financial") ?? undefined,
    status: p.get("status") ?? undefined,
    payment: p.get("payment") ?? undefined,
    delivery: p.get("delivery") ?? undefined,
    tag: p.get("tag") ?? undefined,
    tagNot: p.get("notTag") ?? undefined,
    sku: p.get("sku") ?? undefined,
    stage: p.get("stage") ?? undefined,
    assignee: p.get("assignee") ?? undefined,
    dateRange: p.get("range") ?? undefined,
    dateFrom: p.get("from") ?? undefined,
    dateTo: p.get("to") ?? undefined,
    search: p.get("q") ?? undefined,
  });

  const sort = sortSchema.parse({
    column: p.get("sort") ?? undefined,
    direction: p.get("dir") ?? undefined,
  });

  const colsParam = p.get("cols");
  const columns = (
    colsParam
      ? colsParam.split(",").filter((c): c is OrderColumnId => COLUMN_IDS.has(c as OrderColumnId))
      : (defaultColumns.length ? defaultColumns : DEFAULT_COLUMNS)
  ) as OrderColumnId[];

  return {
    filters,
    sort,
    columns,
    cursor: p.get("cursor"),
    direction: p.get("cursorDir") === "backward" ? "backward" : "forward",
  };
}

/** Serializes filters/sort back into URL search params (stable round-trip). */
export function buildOrdersSearch(
  filters: OrderFilters,
  sort: OrderSort,
  columns?: OrderColumnId[],
  extra?: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  if (filters.fulfillment !== "ANY") p.set("fulfillment", filters.fulfillment);
  if (filters.financial !== "ANY") p.set("financial", filters.financial);
  if (filters.status !== "ANY") p.set("status", filters.status);
  if (filters.payment !== "ANY") p.set("payment", filters.payment);
  if (filters.delivery !== "ANY") p.set("delivery", filters.delivery);
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.tagNot) p.set("notTag", filters.tagNot);
  if (filters.sku) p.set("sku", filters.sku);
  if (filters.stage) p.set("stage", filters.stage);
  if (filters.assignee) p.set("assignee", filters.assignee);
  if (filters.dateRange !== "ANY") p.set("range", filters.dateRange);
  if (filters.dateFrom) p.set("from", filters.dateFrom);
  if (filters.dateTo) p.set("to", filters.dateTo);
  if (filters.search) p.set("q", filters.search);
  if (sort.column !== "orderedAt") p.set("sort", sort.column);
  if (sort.direction !== "desc") p.set("dir", sort.direction);
  if (columns?.length) p.set("cols", columns.join(","));
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) p.set(key, value);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
