import { describe, it, expect } from "vitest";
import {
  buildOrdersCsv,
  buildLineItemsCsv,
  escapeCsvCell,
  CSV_HEADERS,
  LINE_ITEM_CSV_HEADERS,
} from "../src/csv";
import { mapAdminOrderToListItem } from "../src/admin-orders";

const row = mapAdminOrderToListItem({
  id: "gid://shopify/Order/10491",
  name: "#10491",
  createdAt: "2026-09-19T05:30:00Z",
  displayFinancialStatus: "PENDING",
  displayFulfillmentStatus: "UNFULFILLED",
  totalPriceSet: { shopMoney: { amount: "2499.00", currencyCode: "INR" } },
  tags: ["Priority"],
  paymentGatewayNames: ["Cash on Delivery (COD)"],
  customer: {
    displayName: 'John, "Johnny" Mathew',
    email: "john@example.com",
    phone: "+919999999999",
  },
  lineItems: {
    nodes: [
      { id: "li1", title: "Custom Mug", variantTitle: "White", quantity: 2, customAttributes: [] },
    ],
  },
});

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
    // One cell exercising both comma and quote escaping.
    expect(csv).toContain('"John, ""Johnny"" Mathew"');
  });
});


describe("buildLineItemsCsv", () => {
  const order = mapAdminOrderToListItem({
    id: "gid://shopify/Order/10500",
    name: "#10500",
    tags: ["stage:in-production", "assigned:ravi-kumar"],
    lineItems: {
      nodes: [
        {
          id: "li1",
          title: "Custom Mug",
          variantTitle: "White",
          quantity: 2,
          unfulfilledQuantity: 1,
          sku: "MUG-W",
          customAttributes: [
            { key: "Name", value: "Aarav, Jr." },
            { key: "_uploadId", value: "abc123" },
          ],
        },
        {
          id: "li2",
          title: "Keychain",
          quantity: 1,
          customAttributes: [
            { key: "Font", value: "Serif" },
            { key: "Name", value: "Diya" },
          ],
        },
      ],
    },
  });

  it("writes one row per line item with a column per customization", () => {
    const csv = buildLineItemsCsv([order], { stages: ["In production"], staff: ["Ravi Kumar"] });
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe([...LINE_ITEM_CSV_HEADERS, "Name", "Font"].join(","));
    expect(lines[1]).toBe(
      '#10500,,,,Custom Mug,White,MUG-W,,2,1,,,,In production,Ravi Kumar,,,"Aarav, Jr.",',
    );
    expect(lines[2]).toBe("#10500,,,,Keychain,,,,1,1,,,,In production,Ravi Kumar,,,Diya,Serif");
  });

  it("leaves internal properties out unless asked for", () => {
    expect(buildLineItemsCsv([order])).not.toContain("_uploadId");
    expect(buildLineItemsCsv([order], { showInternal: true })).toContain("_uploadId");
  });
});
