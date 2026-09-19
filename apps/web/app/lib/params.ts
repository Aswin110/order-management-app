import {
  orderFiltersSchema,
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

export function parseOrdersPageParams(
  url: URL,
  defaultColumns: string[],
): OrdersPageParams {
  const p = url.searchParams;

  const filters = orderFiltersSchema.parse({
    fulfillment: p.get("fulfillment") ?? undefined,
    financial: p.get("financial") ?? undefined,
    tag: p.get("tag") ?? undefined,
    dateRange: p.get("range") ?? undefined,
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
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.dateRange !== "ANY") p.set("range", filters.dateRange);
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
