import { describe, it, expect } from "vitest";
import { buildOrderWhere, buildOrderBy } from "../src/order-query";
import { defaultOrderFilters, type OrderFilters } from "../src/filters";

const filters = (overrides: Partial<OrderFilters> = {}): OrderFilters => ({
  ...defaultOrderFilters,
  ...overrides,
});

describe("buildOrderWhere", () => {
  it("always scopes to the shop", () => {
    const where = buildOrderWhere("shop-1", filters(), 5000);
    expect(where.shopId).toBe("shop-1");
  });

  it("filters unfulfilled orders including partial and null states", () => {
    const where = buildOrderWhere("s", filters({ fulfillment: "UNFULFILLED" }), 5000);
    expect(where.OR).toEqual([
      { fulfillmentStatus: "UNFULFILLED" },
      { fulfillmentStatus: "PARTIALLY_FULFILLED" },
      { fulfillmentStatus: null },
    ]);
  });

  it("filters COD pending and verified", () => {
    expect(buildOrderWhere("s", filters({ cod: "COD_PENDING" }), 5000).codStatus).toBe("PENDING");
    expect(buildOrderWhere("s", filters({ cod: "COD_VERIFIED" }), 5000).codStatus).toBe("VERIFIED");
    expect(buildOrderWhere("s", filters({ cod: "COD" }), 5000).codStatus).toEqual({
      in: ["PENDING", "VERIFIED", "FAILED"],
    });
  });

  it("filters high-value orders by the shop threshold", () => {
    const where = buildOrderWhere("s", filters({ highValueOnly: true }), 5000);
    expect(String(where.totalPrice && (where.totalPrice as { gte: unknown }).gte)).toBe("5000");
  });

  it("filters orders with notes via the denormalized counter", () => {
    const where = buildOrderWhere("s", filters({ hasNotes: true }), 5000);
    expect(where.notesCount).toEqual({ gt: 0 });
  });

  it("filters assigned and unassigned orders", () => {
    expect(buildOrderWhere("s", filters({ assigned: "ASSIGNED" }), 5000).assignedStaffId).toEqual({ not: null });
    expect(buildOrderWhere("s", filters({ assigned: "UNASSIGNED" }), 5000).assignedStaffId).toBeNull();
  });

  it("filters by date ranges", () => {
    const today = buildOrderWhere("s", filters({ dateRange: "TODAY" }), 5000);
    const gte = (today.orderedAt as { gte: Date }).gte;
    expect(gte.getHours()).toBe(0);
    const last7 = buildOrderWhere("s", filters({ dateRange: "LAST_7_DAYS" }), 5000);
    const gte7 = (last7.orderedAt as { gte: Date }).gte;
    expect(Date.now() - gte7.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it("combines multiple filters at once (COD + Unfulfilled + Today)", () => {
    const where = buildOrderWhere(
      "s",
      filters({ cod: "COD", fulfillment: "UNFULFILLED", dateRange: "TODAY" }),
      5000,
    );
    expect(where.codStatus).toBeDefined();
    expect(where.OR).toBeDefined();
    expect(where.orderedAt).toBeDefined();
  });

  it("searches order number, customer, email, and phone server-side", () => {
    const where = buildOrderWhere("s", filters({ search: "10491" }), 5000);
    const and = where.AND as Array<{ OR: Array<Record<string, unknown>> }>;
    expect(and).toHaveLength(1);
    expect(and[0]?.OR.map((c) => Object.keys(c)[0])).toEqual([
      "name",
      "customerName",
      "email",
      "phone",
    ]);
  });
});

describe("buildOrderBy", () => {
  it("whitelists sortable columns and falls back to orderedAt", () => {
    const orderBy = buildOrderBy({ column: "evilColumn" as never, direction: "asc" });
    expect(orderBy[0]).toEqual({ orderedAt: "asc" });
  });
  it("adds a stable tiebreaker", () => {
    const orderBy = buildOrderBy({ column: "totalPrice", direction: "desc" });
    expect(orderBy).toEqual([{ totalPrice: "desc" }, { id: "desc" }]);
  });
});
