import { z } from "zod";

// A calendar day, YYYY-MM-DD. A malformed value in a URL is dropped rather
// than failing the whole page.
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

/**
 * Filters that translate directly into the Shopify Admin order search
 * syntax (see buildOrderSearchQuery). Every filter must be expressible as
 * a Shopify query: the orders list is always a live Shopify query, never
 * a filtered local cache.
 */
export const orderFiltersSchema = z.object({
  fulfillment: z
    .enum(["ANY", "FULFILLED", "UNFULFILLED", "PARTIALLY_FULFILLED"])
    .default("ANY"),
  financial: z
    .enum(["ANY", "PAID", "PENDING", "AUTHORIZED", "REFUNDED"])
    .default("ANY"),
  status: z.enum(["ANY", "OPEN", "CLOSED", "CANCELLED"]).default("ANY"),
  payment: z.enum(["ANY", "COD", "PREPAID"]).default("ANY"),
  delivery: z
    .enum(["ANY", "SHIPPING", "LOCAL", "PICK_UP", "PICKUP_POINT", "RETAIL", "NONE"])
    .default("ANY"),
  tag: z.string().trim().max(100).optional(),
  tagNot: z.string().trim().max(100).optional(),
  sku: z.string().trim().max(100).optional(),
  // Workflow stage / assignee slug (see workflow.ts), or "none" for orders
  // that have no stage / nobody assigned.
  stage: z.string().trim().max(40).optional(),
  assignee: z.string().trim().max(40).optional(),
  dateRange: z
    .enum(["ANY", "TODAY", "LAST_7_DAYS", "LAST_30_DAYS", "CUSTOM"])
    .default("ANY"),
  // Inclusive bounds, used when dateRange is CUSTOM.
  dateFrom: calendarDay,
  dateTo: calendarDay,
  search: z.string().trim().max(200).optional(),
});

export type OrderFilters = z.infer<typeof orderFiltersSchema>;

export const defaultOrderFilters: OrderFilters = orderFiltersSchema.parse({});

export const sortSchema = z.object({
  column: z.enum(["name", "orderedAt", "totalPrice"]).default("orderedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type OrderSort = z.infer<typeof sortSchema>;

export const savedViewInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: orderFiltersSchema,
  sort: sortSchema.optional(),
  columns: z.array(z.string()).max(30).default([]),
});
