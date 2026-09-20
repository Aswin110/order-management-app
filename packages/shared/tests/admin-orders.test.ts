import { describe, it, expect } from "vitest";
import {
  mapAdminOrderToListItem,
  mapLineItem,
  lineItemSummary,
  type AdminOrderNode,
} from "../src/admin-orders";
import { isCodOrder } from "../src/cod";

const node: AdminOrderNode = {
  id: "gid://shopify/Order/10491",
  name: "#10491",
  createdAt: "2026-09-19T05:30:00Z",
  displayFinancialStatus: "PENDING",
  displayFulfillmentStatus: "UNFULFILLED",
  currencyCode: "INR",
  totalPriceSet: { shopMoney: { amount: "2499.00", currencyCode: "INR" } },
  tags: ["Priority"],
  paymentGatewayNames: ["Cash on Delivery (COD)"],
  customer: { displayName: "John Mathew", email: "john@example.com", phone: "+919999999999" },
  lineItems: {
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: "gid://shopify/LineItem/1",
        title: "Custom Photo Mug",
        variantTitle: "White / 325ml",
        quantity: 2,
        sku: "MUG-W-325",
        image: { url: "https://cdn.shopify.com/mug.png", altText: "Mug" },
        originalUnitPriceSet: { shopMoney: { amount: "999.00" } },
        discountedTotalSet: { shopMoney: { amount: "1998.00" } },
        customAttributes: [
          { key: "Photo", value: "https://files.example/photo.png" },
          { key: "Text", value: "Happy Birthday" },
        ],
      },
      {
        id: "gid://shopify/LineItem/2",
        title: "Gift Wrap",
        variantTitle: null,
        quantity: 1,
        customAttributes: [],
      },
    ],
  },
};

describe("isCodOrder", () => {
  it("detects COD gateway names", () => {
    expect(isCodOrder(["Cash on Delivery (COD)"])).toBe(true);
    expect(isCodOrder(["cash_on_delivery"])).toBe(true);
    expect(isCodOrder(["shopify_payments"])).toBe(false);
    expect(isCodOrder([])).toBe(false);
  });
});

describe("mapAdminOrderToListItem", () => {
  it("flattens order, line items, images, variants, prices, and custom properties", () => {
    const row = mapAdminOrderToListItem(node);
    expect(row.name).toBe("#10491");
    expect(row.customerName).toBe("John Mathew");
    expect(row.totalPrice).toBe("2499.00");
    expect(row.currency).toBe("INR");
    expect(row.itemCount).toBe(3);
    expect(row.cod).toBe(true);
    expect(row.codStatus).toBe("PENDING"); // default for a fresh COD order

    const [mug, wrap] = row.items;
    expect(mug!.variantTitle).toBe("White / 325ml");
    expect(mug!.quantity).toBe(2);
    expect(mug!.imageUrl).toBe("https://cdn.shopify.com/mug.png");
    expect(mug!.unitPrice).toBe("999.00");
    expect(mug!.lineTotal).toBe("1998.00");
    expect(mug!.customAttributes).toEqual([
      { key: "Photo", value: "https://files.example/photo.png" },
      { key: "Text", value: "Happy Birthday" },
    ]);
    expect(wrap!.variantTitle).toBeNull();
    expect(wrap!.customAttributes).toEqual([]);
    expect(row.hasMoreItems).toBe(false);
  });

  it("merges the operational overlay", () => {
    const row = mapAdminOrderToListItem(node, {
      codStatus: "VERIFIED",
      assignedStaffId: "staff-1",
      assignedStaffName: "Anjali",
      notesCount: 2,
      latestNote: "Call before shipping",
    });
    expect(row.codStatus).toBe("VERIFIED");
    expect(row.assignedStaffName).toBe("Anjali");
    expect(row.notesCount).toBe(2);
    expect(row.latestNote).toBe("Call before shipping");
  });

  it("does not force PENDING on non-COD orders", () => {
    const row = mapAdminOrderToListItem({ ...node, paymentGatewayNames: ["shopify_payments"] });
    expect(row.cod).toBe(false);
    expect(row.codStatus).toBe("NOT_COD");
  });

  it("tolerates missing optional data", () => {
    const row = mapAdminOrderToListItem({ id: "gid://shopify/Order/1" });
    expect(row.name).toBe("gid://shopify/Order/1");
    expect(row.items).toEqual([]);
    expect(row.itemCount).toBe(0);
    expect(row.totalPrice).toBeNull();
  });
});

describe("mapLineItem / lineItemSummary", () => {
  it("summarizes quantity, title, and variant", () => {
    const item = mapLineItem(node.lineItems!.nodes![0]!);
    expect(lineItemSummary(item)).toBe("2 x Custom Photo Mug (White / 325ml)");
    const wrap = mapLineItem(node.lineItems!.nodes![1]!);
    expect(lineItemSummary(wrap)).toBe("1 x Gift Wrap");
  });
});
