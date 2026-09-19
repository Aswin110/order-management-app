import { describe, it, expect } from "vitest";
import { buildOrdersCsv, escapeCsvCell, CSV_HEADERS } from "../src/csv";
import { mapAdminOrderToListItem } from "../src/admin-orders";

const row = mapAdminOrderToListItem(
  {
    id: "gid://shopify/Order/10491",
    name: "#10491",
    createdAt: "2026-09-19T05:30:00Z",
    displayFinancialStatus: "PENDING",
    displayFulfillmentStatus: "UNFULFILLED",
    totalPriceSet: { shopMoney: { amount: "2499.00", currencyCode: "INR" } },
    tags: ["Priority"],
    paymentGatewayNames: ["Cash on Delivery (COD)"],
    customer: { displayName: "John, Mathew", email: "john@example.com", phone: "+919999999999" },
    lineItems: {
      nodes: [
        { id: "li1", title: "Custom Mug", variantTitle: "White", quantity: 2, customAttributes: [] },
      ],
    },
  },
  {
    codStatus: "PENDING",
    assignedStaffId: "staff-1",
    assignedStaffName: 'Anjali "AJ"',
    notesCount: 0,
    latestNote: null,
  },
);

describe("escapeCsvCell", () => {
  it("escapes commas and quotes", () => {
    expect(escapeCsvCell("John, Mathew")).toBe('"John, Mathew"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it("passes plain values through", () => {
    expect(escapeCsvCell("#10491")).toBe("#10491");
  });
});

describe("buildOrdersCsv", () => {
  it("writes headers and one line per order", () => {
    const csv = buildOrdersCsv([row, { ...row, name: "#10492" }]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADERS.join(","));
    expect(lines).toHaveLength(3);
  });
  it("includes item summaries, and escapes commas and quotes", () => {
    const csv = buildOrdersCsv([row]);
    expect(csv).toContain("2 x Custom Mug (White)");
    expect(csv).toContain('"John, Mathew"');
    expect(csv).toContain('"Anjali ""AJ"""');
  });
});
