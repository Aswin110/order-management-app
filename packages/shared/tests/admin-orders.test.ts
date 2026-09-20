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

  it("maps the note, ship-to, payment method and delivery method", () => {
    const row = mapAdminOrderToListItem({
      ...node,
      note: "  Gift wrap in red  ",
      shippingLine: { title: "Standard" },
      shippingAddress: {
        address1: "12 MG Road",
        address2: "Flat 4",
        city: "Bengaluru",
        provinceCode: "KA",
        zip: "560001",
        countryCodeV2: "IN",
      },
    });
    expect(row.note).toBe("Gift wrap in red");
    expect(row.shipTo).toBe("Bengaluru, KA, IN");
    expect(row.shipToFull).toBe("12 MG Road, Flat 4, Bengaluru, KA, 560001, IN");
    expect(row.paymentMethod).toBe("Cash on Delivery (COD)");
    expect(row.deliveryMethod).toBe("Standard");
  });

  it("leaves the new fields null when Shopify omits them", () => {
    const row = mapAdminOrderToListItem({ id: "gid://shopify/Order/1" });
    expect(row.note).toBeNull();
    expect(row.shipTo).toBeNull();
    expect(row.paymentMethod).toBeNull();
    expect(row.deliveryMethod).toBeNull();
  });

  it("maps the extra line item production fields", () => {
    const row = mapAdminOrderToListItem({
      ...node,
      lineItems: {
        nodes: [
          {
            id: "li-1",
            title: "Engraved Pen",
            quantity: 3,
            vendor: "  Acme Pottery  ",
            unfulfilledQuantity: 2,
            requiresShipping: false,
            totalDiscountSet: { shopMoney: { amount: "100.00" } },
          },
        ],
      },
    });
    const item = row.items[0]!;
    expect(item.vendor).toBe("Acme Pottery");
    expect(item.unfulfilledQuantity).toBe(2);
    expect(item.requiresShipping).toBe(false);
    expect(item.lineDiscount).toBe("100.00");
  });

  it("falls back sensibly when the production fields are absent", () => {
    const row = mapAdminOrderToListItem({
      ...node,
      lineItems: { nodes: [{ id: "li-1", title: "Mug", quantity: 4 }] },
    });
    const item = row.items[0]!;
    expect(item.vendor).toBeNull();
    // Nothing fulfilled yet, so the whole quantity still has to be made.
    expect(item.unfulfilledQuantity).toBe(4);
    expect(item.requiresShipping).toBe(true);
    // A zero discount is not worth showing.
    expect(item.lineDiscount).toBeNull();
  });

  it("flags non-COD gateways as not COD", () => {
    const row = mapAdminOrderToListItem({ ...node, paymentGatewayNames: ["shopify_payments"] });
    expect(row.cod).toBe(false);
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
