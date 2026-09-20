import { z } from "zod";

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
  tag: z.string().trim().max(100).optional(),
  dateRange: z.enum(["ANY", "TODAY", "LAST_7_DAYS", "LAST_30_DAYS"]).default("ANY"),
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
