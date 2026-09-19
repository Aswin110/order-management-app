import { describe, it, expect } from "vitest";
import { buildOrderSearchQuery, toShopifySort } from "../src/shopify-query";
import { defaultOrderFilters } from "../src/filters";

describe("buildOrderSearchQuery", () => {
  it("returns undefined for the default (unfiltered) view", () => {
    expect(buildOrderSearchQuery(defaultOrderFilters)).toBeUndefined();
  });

  it("maps fulfillment and financial statuses to Shopify search terms", () => {
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, fulfillment: "UNFULFILLED" }),
    ).toBe("fulfillment_status:unfulfilled");
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, financial: "PAID" }),
    ).toBe("financial_status:paid");
    expect(
      buildOrderSearchQuery({
        ...defaultOrderFilters,
        fulfillment: "PARTIALLY_FULFILLED",
        financial: "AUTHORIZED",
      }),
    ).toBe("fulfillment_status:partial financial_status:authorized");
  });

  it("quotes tags and search terms with spaces", () => {
    const q = buildOrderSearchQuery({
      ...defaultOrderFilters,
      tag: "Priority COD",
      search: "John Mathew",
    });
    expect(q).toBe('tag:"Priority COD" "John Mathew"');
  });

  it("escapes double quotes inside terms", () => {
    const q = buildOrderSearchQuery({ ...defaultOrderFilters, search: 'say "hi"' });
    expect(q).toBe('"say \\"hi\\""');
  });

  it("keeps simple search tokens bare", () => {
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, search: "#10491" })).toBe("#10491");
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, search: "a@b.com" })).toBe("a@b.com");
  });

  it("adds created_at bounds for date ranges", () => {
    const q = buildOrderSearchQuery({ ...defaultOrderFilters, dateRange: "LAST_7_DAYS" })!;
    expect(q).toMatch(/^created_at:>=\d{4}-\d{2}-\d{2}$/);
    const bound = new Date(q.replace("created_at:>=", "") + "T00:00:00Z").getTime();
    const sixDays = 6 * 24 * 60 * 60 * 1000;
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    expect(Date.now() - bound).toBeGreaterThan(sixDays);
    expect(Date.now() - bound).toBeLessThan(eightDays);
  });

  it("combines terms with AND semantics", () => {
    const q = buildOrderSearchQuery({
      ...defaultOrderFilters,
      fulfillment: "UNFULFILLED",
      dateRange: "TODAY",
      search: "10491",
    });
    expect(q).toBe(
      `fulfillment_status:unfulfilled created_at:>=${new Date().toISOString().slice(0, 10)} 10491`,
    );
  });
});

describe("toShopifySort", () => {
  it("maps columns to Shopify sort keys", () => {
    expect(toShopifySort({ column: "orderedAt", direction: "desc" })).toEqual({
      sortKey: "CREATED_AT",
      reverse: false,
    });
    expect(toShopifySort({ column: "name", direction: "asc" })).toEqual({
      sortKey: "ORDER_NUMBER",
      reverse: true,
    });
    expect(toShopifySort({ column: "totalPrice", direction: "desc" })).toEqual({
      sortKey: "TOTAL_PRICE",
      reverse: false,
    });
  });
});
