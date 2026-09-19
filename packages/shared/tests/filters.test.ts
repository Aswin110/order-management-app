import { describe, it, expect } from "vitest";
import { orderFiltersSchema, savedViewInputSchema } from "../src/filters";

describe("orderFiltersSchema", () => {
  it("applies defaults", () => {
    const f = orderFiltersSchema.parse({});
    expect(f.fulfillment).toBe("ANY");
    expect(f.cod).toBe("ANY");
    expect(f.dateRange).toBe("ANY");
    expect(f.highValueOnly).toBe(false);
  });
  it("rejects invalid enum values", () => {
    expect(() => orderFiltersSchema.parse({ cod: "BOGUS" })).toThrow();
  });
});

describe("savedViewInputSchema", () => {
  it("requires a non-empty name", () => {
    expect(() => savedViewInputSchema.parse({ name: "  ", filters: {} })).toThrow();
  });
  it("accepts a complete view", () => {
    const v = savedViewInputSchema.parse({
      name: "Today's COD",
      filters: { cod: "COD", dateRange: "TODAY", fulfillment: "UNFULFILLED" },
      columns: ["name", "codStatus"],
    });
    expect(v.name).toBe("Today's COD");
    expect(v.filters.cod).toBe("COD");
  });
});
