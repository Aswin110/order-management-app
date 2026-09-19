import { describe, it, expect } from "vitest";
import { mapShopifyOrder, isCodOrder } from "../src/order-mapping";

describe("isCodOrder", () => {
  it("detects cash on delivery gateways", () => {
    expect(isCodOrder(["Cash on Delivery (COD)"])).toBe(true);
    expect(isCodOrder(["cash_on_delivery"])).toBe(true);
    expect(isCodOrder(["COD"])).toBe(true);
  });
  it("returns false for prepaid gateways", () => {
    expect(isCodOrder(["Razorpay", "UPI"])).toBe(false);
    expect(isCodOrder([])).toBe(false);
    expect(isCodOrder([null])).toBe(false);
  });
});

describe("mapShopifyOrder (GraphQL payload)", () => {
  const graphqlOrder = {
    id: "gid://shopify/Order/10491",
    name: "#10491",
    createdAt: "2026-09-19T05:30:00Z",
    email: "john@example.com",
    phone: null,
    displayFinancialStatus: "PENDING",
    displayFulfillmentStatus: "UNFULFILLED",
    currencyCode: "INR",
    totalPriceSet: { shopMoney: { amount: "2499.00" } },
    tags: ["Priority", "Metro"],
    paymentGatewayNames: ["Cash on Delivery (COD)"],
    riskLevel: "MEDIUM",
    customer: { displayName: "John Mathew", email: "john@example.com", phone: "+919999999999" },
    lineItems: { nodes: [{ id: "1" }, { id: "2" }, { id: "3" }] },
    shippingAddress: { city: "Thrissur", provinceCode: "KL" },
  };

  it("maps core fields", () => {
    const mapped = mapShopifyOrder(graphqlOrder as never);
    expect(mapped.shopifyOrderId).toBe("gid://shopify/Order/10491");
    expect(mapped.name).toBe("#10491");
    expect(mapped.customerName).toBe("John Mathew");
    expect(mapped.phone).toBe("+919999999999");
    expect(mapped.totalPrice).toBe("2499.00");
    expect(mapped.currency).toBe("INR");
    expect(mapped.itemCount).toBe(3);
    expect(mapped.tags).toEqual(["Priority", "Metro"]);
    expect(mapped.riskLevel).toBe("MEDIUM");
    expect(mapped.orderedAt.toISOString()).toBe("2026-09-19T05:30:00.000Z");
  });

  it("marks COD gateway orders as pending verification", () => {
    expect(mapShopifyOrder(graphqlOrder as never).codStatus).toBe("PENDING");
  });

  it("preserves an existing manual COD status on re-sync", () => {
    expect(mapShopifyOrder(graphqlOrder as never, "VERIFIED").codStatus).toBe("VERIFIED");
  });

  it("marks prepaid orders as NOT_COD", () => {
    const prepaid = { ...graphqlOrder, paymentGatewayNames: ["Razorpay"] };
    expect(mapShopifyOrder(prepaid as never).codStatus).toBe("NOT_COD");
  });
});

describe("mapShopifyOrder (webhook/REST payload)", () => {
  it("maps REST-style snake_case fields", () => {
    const rest = {
      id: "gid://shopify/Order/200",
      name: "#200",
      created_at: "2026-09-18T10:00:00Z",
      financial_status: "paid",
      fulfillment_status: null,
      total_price: "999.00",
      currency: "INR",
      line_items: [{}, {}],
      tags: "COD, Priority",
      payment_gateway_names: ["cod"],
      customer: { first_name: "A", last_name: "B", email: "a@b.com" },
    };
    const mapped = mapShopifyOrder(rest as never);
    expect(mapped.financialStatus).toBe("PAID");
    expect(mapped.fulfillmentStatus).toBeNull();
    expect(mapped.totalPrice).toBe("999.00");
    expect(mapped.itemCount).toBe(2);
    expect(mapped.tags).toEqual(["COD", "Priority"]);
    expect(mapped.codStatus).toBe("PENDING");
  });

  it("handles cancelled orders", () => {
    const mapped = mapShopifyOrder({
      id: "gid://shopify/Order/1",
      cancelled_at: "2026-09-19T00:00:00Z",
    } as never);
    expect(mapped.cancelledAt?.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});
