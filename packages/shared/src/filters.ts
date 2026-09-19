import { z } from "zod";

export const codStatusSchema = z.enum([
  "NOT_COD",
  "PENDING",
  "VERIFIED",
  "FAILED",
  "CANCELLED",
]);

export const orderFiltersSchema = z.object({
  fulfillment: z.enum(["ANY", "FULFILLED", "UNFULFILLED"]).default("ANY"),
  financial: z.enum(["ANY", "PAID", "PENDING"]).default("ANY"),
  cod: z
    .enum(["ANY", "COD", "COD_PENDING", "COD_VERIFIED", "NOT_COD"])
    .default("ANY"),
  highValueOnly: z.boolean().default(false),
  hasNotes: z.boolean().default(false),
  hasTags: z.boolean().default(false),
  tag: z.string().optional(),
  assigned: z.enum(["ANY", "ASSIGNED", "UNASSIGNED"]).default("ANY"),
  staffId: z.string().optional(),
  dateRange: z.enum(["ANY", "TODAY", "LAST_7_DAYS", "LAST_30_DAYS"]).default("ANY"),
  search: z.string().trim().max(200).optional(),
});

export type OrderFilters = z.infer<typeof orderFiltersSchema>;

export const defaultOrderFilters: OrderFilters = orderFiltersSchema.parse({});

export const sortSchema = z.object({
  column: z
    .enum(["name", "orderedAt", "customerName", "totalPrice", "itemCount"])
    .default("orderedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type OrderSort = z.infer<typeof sortSchema>;

export const savedViewInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: orderFiltersSchema,
  sort: sortSchema.optional(),
  columns: z.array(z.string()).max(30).default([]),
});
