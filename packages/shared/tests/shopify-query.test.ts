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

  // 2026-10-04 20:30 UTC is already 2026-10-05 02:00 in India.
  const lateEvening = { timeZone: "Asia/Kolkata", now: new Date("2026-10-04T20:30:00Z") };

  it("starts \"today\" at midnight in the shop's timezone, not UTC", () => {
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, dateRange: "TODAY" }, lateEvening),
    ).toBe("created_at:>='2026-10-04T18:30:00Z'");
    expect(
      buildOrderSearchQuery(
        { ...defaultOrderFilters, dateRange: "TODAY" },
        { timeZone: "America/New_York", now: new Date("2026-10-04T20:30:00Z") },
      ),
    ).toBe("created_at:>='2026-10-04T04:00:00Z'");
  });

  it("adds created_at bounds for rolling date ranges", () => {
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, dateRange: "LAST_7_DAYS" }, lateEvening),
    ).toBe("created_at:>='2026-09-27T18:30:00Z'");
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, dateRange: "LAST_30_DAYS" }, lateEvening),
    ).toBe("created_at:>='2026-09-04T18:30:00Z'");
  });

  it("treats a custom range as whole days, inclusive of the end day", () => {
    expect(
      buildOrderSearchQuery(
        { ...defaultOrderFilters, dateRange: "CUSTOM", dateFrom: "2026-10-01", dateTo: "2026-10-03" },
        lateEvening,
      ),
    ).toBe("created_at:>='2026-09-30T18:30:00Z' created_at:<'2026-10-03T18:30:00Z'");
    expect(
      buildOrderSearchQuery(
        { ...defaultOrderFilters, dateRange: "CUSTOM", dateTo: "2026-10-03" },
        lateEvening,
      ),
    ).toBe("created_at:<'2026-10-03T18:30:00Z'");
  });

  it("handles a daylight-saving change day", () => {
    // Clocks in New York go back on 2026-11-01, so that day starts at UTC-4.
    expect(
      buildOrderSearchQuery(
        { ...defaultOrderFilters, dateRange: "CUSTOM", dateFrom: "2026-11-01", dateTo: "2026-11-01" },
        { timeZone: "America/New_York" },
      ),
    ).toBe("created_at:>='2026-11-01T04:00:00Z' created_at:<'2026-11-02T05:00:00Z'");
  });

  it("combines terms with AND semantics", () => {
    const q = buildOrderSearchQuery(
      { ...defaultOrderFilters, fulfillment: "UNFULFILLED", dateRange: "TODAY", search: "10491" },
      lateEvening,
    );
    expect(q).toBe("fulfillment_status:unfulfilled created_at:>='2026-10-04T18:30:00Z' 10491");
  });

  it("maps order status, delivery method, SKU and excluded tags", () => {
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, status: "CANCELLED" })).toBe(
      "status:cancelled",
    );
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, status: "CLOSED" })).toBe(
      "status:closed",
    );
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, delivery: "PICK_UP" })).toBe(
      "delivery_method:pick-up",
    );
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, sku: "MUG-W-325", tagNot: "On hold" }),
    ).toBe('tag_not:"On hold" sku:MUG-W-325');
  });

  it("expresses COD and prepaid through the payment gateway", () => {
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, payment: "COD" })).toBe(
      '(gateway:"Cash on Delivery (COD)" OR gateway:"Cash on Delivery" OR gateway:cash_on_delivery OR gateway:cod)',
    );
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, payment: "PREPAID" })).toBe(
      '-gateway:"Cash on Delivery (COD)" -gateway:"Cash on Delivery" -gateway:cash_on_delivery -gateway:cod',
    );
  });

  it("filters by workflow stage and assignee tags", () => {
    const context = { stages: ["To make", "In production"], staff: ["Ravi Kumar"] };
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, stage: "in-production" }, context),
    ).toBe('tag:"stage:in-production"');
    expect(
      buildOrderSearchQuery({ ...defaultOrderFilters, assignee: "ravi-kumar" }, context),
    ).toBe('tag:"assigned:ravi-kumar"');
  });

  it("expresses \"no stage\" and \"unassigned\" as the absence of every configured tag", () => {
    const context = { stages: ["To make", "In production"], staff: ["Ravi Kumar"] };
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, stage: "none" }, context)).toBe(
      'tag_not:"stage:to-make" tag_not:"stage:in-production"',
    );
    expect(buildOrderSearchQuery({ ...defaultOrderFilters, assignee: "none" }, context)).toBe(
      'tag_not:"assigned:ravi-kumar"',
    );
  });

  it("appends extra raw terms before the free-text search", () => {
    expect(
      buildOrderSearchQuery(
        { ...defaultOrderFilters, search: "mug" },
        { extraTerms: ["-fulfillment_status:fulfilled"] },
      ),
    ).toBe("-fulfillment_status:fulfilled mug");
  });
});

describe("toShopifySort", () => {
  it("maps columns to Shopify sort keys", () => {
    // Shopify sorts ascending unless reversed, so "newest first" needs reverse.
    expect(toShopifySort({ column: "orderedAt", direction: "desc" })).toEqual({
      sortKey: "CREATED_AT",
      reverse: true,
    });
    expect(toShopifySort({ column: "name", direction: "asc" })).toEqual({
      sortKey: "ORDER_NUMBER",
      reverse: false,
    });
    expect(toShopifySort({ column: "totalPrice", direction: "desc" })).toEqual({
      sortKey: "TOTAL_PRICE",
      reverse: true,
    });
  });
});
