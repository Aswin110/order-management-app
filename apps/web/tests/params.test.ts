import { describe, it, expect } from "vitest";
import { defaultOrderFilters, type OrderFilters } from "@order-operations/shared";
import { buildOrdersSearch, normalizeFilters, parseOrdersPageParams } from "../app/lib/params";
import { moveItem } from "../app/lib/drag-reorder";

const sort = { column: "orderedAt", direction: "desc" } as const;

describe("order filters in the URL", () => {
  it("round-trips every filter through the search string", () => {
    const filters: OrderFilters = {
      fulfillment: "UNFULFILLED",
      financial: "PAID",
      status: "OPEN",
      payment: "COD",
      delivery: "SHIPPING",
      tag: "Priority",
      tagNot: "On hold",
      sku: "MUG-W-325",
      stage: "in-production",
      assignee: "none",
      dateRange: "CUSTOM",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-03",
      search: "John Mathew",
    };
    const url = new URL(`https://app.example/app/orders${buildOrdersSearch(filters, sort)}`);
    expect(parseOrdersPageParams(url, []).filters).toEqual(filters);
  });

  it("writes nothing for the default filters", () => {
    expect(buildOrdersSearch(defaultOrderFilters, sort)).toBe("");
  });

  it("keeps the column order given in the URL", () => {
    const url = new URL("https://app.example/app/orders?cols=stage,name,totalPrice,bogus");
    expect(parseOrdersPageParams(url, []).columns).toEqual(["stage", "name", "totalPrice"]);
  });
});

describe("normalizeFilters", () => {
  it("fills in filters that did not exist when a view was saved", () => {
    const saved = { fulfillment: "UNFULFILLED", financial: "ANY", dateRange: "TODAY" };
    const filters = normalizeFilters(saved);
    expect(filters.fulfillment).toBe("UNFULFILLED");
    expect(filters.status).toBe("ANY");
    expect(filters.payment).toBe("ANY");
    // An old view must not put "undefined" into the URL.
    expect(buildOrdersSearch(filters, sort)).toBe("?fulfillment=UNFULFILLED&range=TODAY");
  });

  it("falls back to the defaults for unreadable data", () => {
    expect(normalizeFilters(null)).toEqual(defaultOrderFilters);
    expect(normalizeFilters({ fulfillment: "BOGUS" })).toEqual(defaultOrderFilters);
  });
});

describe("moveItem (drag-and-drop column order)", () => {
  const columns = ["name", "orderedAt", "customerName", "stage"];

  it("drops a column dragged backwards in front of the target", () => {
    expect(moveItem(columns, "stage", "name")).toEqual(["stage", "name", "orderedAt", "customerName"]);
  });
  it("drops a column dragged forwards after the target", () => {
    expect(moveItem(columns, "name", "customerName")).toEqual(["orderedAt", "customerName", "name", "stage"]);
  });
  it("leaves the order alone for a drop on itself or an unknown column", () => {
    expect(moveItem(columns, "stage", "stage")).toEqual(columns);
    expect(moveItem(columns, "stage", "bogus")).toEqual(columns);
  });
});
