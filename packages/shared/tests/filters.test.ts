import { describe, it, expect } from "vitest";
import { orderFiltersSchema, savedViewInputSchema } from "../src/filters";

describe("orderFiltersSchema", () => {
  it("applies defaults", () => {
    const f = orderFiltersSchema.parse({});
    expect(f.fulfillment).toBe("ANY");
    expect(f.financial).toBe("ANY");
    expect(f.dateRange).toBe("ANY");
    expect(f.tag).toBeUndefined();
    expect(f.search).toBeUndefined();
  });
  it("defaults the newer filters to \"any\"", () => {
    const f = orderFiltersSchema.parse({});
    expect(f.status).toBe("ANY");
    expect(f.payment).toBe("ANY");
    expect(f.delivery).toBe("ANY");
    expect(f.stage).toBeUndefined();
  });
  it("drops a malformed custom date instead of failing", () => {
    const f = orderFiltersSchema.parse({ dateRange: "CUSTOM", dateFrom: "yesterday", dateTo: "2026-10-03" });
    expect(f.dateFrom).toBeUndefined();
    expect(f.dateTo).toBe("2026-10-03");
  });
  it("rejects invalid enum values", () => {
    expect(() => orderFiltersSchema.parse({ fulfillment: "BOGUS" })).toThrow();
    expect(() => orderFiltersSchema.parse({ dateRange: "YESTERDAY" })).toThrow();
  });
});

describe("savedViewInputSchema", () => {
  it("requires a non-empty name", () => {
    expect(() => savedViewInputSchema.parse({ name: "  ", filters: {} })).toThrow();
  });
  it("accepts a complete view", () => {
    const v = savedViewInputSchema.parse({
      name: "Today's unfulfilled",
      filters: { fulfillment: "UNFULFILLED", dateRange: "TODAY" },
      columns: ["name", "items"],
    });
    expect(v.name).toBe("Today's unfulfilled");
    expect(v.filters.fulfillment).toBe("UNFULFILLED");
  });
});
