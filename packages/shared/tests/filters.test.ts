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
