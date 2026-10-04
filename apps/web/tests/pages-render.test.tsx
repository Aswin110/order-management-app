// Renders each page to HTML with realistic loader data. The pages are mostly
// Polaris custom elements, so this checks the logic around them: what shows,
// what is hidden, and in what order.

import { describe, it, expect, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import {
  buildProductionSummary,
  defaultOrderFilters,
  mapAdminOrderToListItem,
  type AdminOrderNode,
} from "@order-operations/shared";

vi.mock("../app/shopify.server", () => ({ authenticate: {} }));
vi.mock("../app/db.server", () => ({ default: {}, prisma: {} }));

import OrdersPage from "../app/routes/app.orders";
import OrderDetailsPage from "../app/routes/app.orders.$orderId";
import ProductionSummaryPage from "../app/routes/app.production";
import PrintPage from "../app/routes/app.print";
import SettingsPage from "../app/routes/app.settings";

const workflow = {
  stages: ["To make", "In production", "Packed"],
  staff: ["Ravi Kumar"],
  showInternalProperties: false,
};

const codOrder: AdminOrderNode = {
  id: "gid://shopify/Order/1",
  name: "#1001",
  createdAt: "2026-10-01T05:30:00Z",
  displayFinancialStatus: "PENDING",
  displayFulfillmentStatus: "UNFULFILLED",
  currencyCode: "INR",
  totalPriceSet: { shopMoney: { amount: "999.00", currencyCode: "INR" } },
  tags: ["Priority", "stage:in-production", "assigned:ravi-kumar", "cod:confirmed"],
  paymentGatewayNames: ["Cash on Delivery (COD)"],
  discountCodes: ["DIWALI10"],
  shippingAddress: { name: "Meera Nair", address1: "12 MG Road", city: "Kochi", phone: "+919000000000" },
  fulfillments: [
    {
      id: "gid://shopify/Fulfillment/1",
      displayStatus: "IN_TRANSIT",
      totalQuantity: 1,
      trackingInfo: [{ company: "Delhivery", number: "DL123", url: "https://track.example/DL123" }],
    },
  ],
  refunds: [{ id: "gid://shopify/Refund/1", note: "Damaged", totalRefundedSet: { shopMoney: { amount: "100.00" } } }],
  lineItems: {
    nodes: [
      {
        id: "gid://shopify/LineItem/1",
        title: "Custom Mug",
        variantTitle: "White",
        sku: "MUG-W",
        quantity: 2,
        unfulfilledQuantity: 2,
        customAttributes: [
          { key: "Name", value: "Aarav" },
          { key: "Artwork", value: "https://files.example/uploads/art.png" },
          { key: "_uploadId", value: "internal-123" },
        ],
      },
    ],
  },
};

const cancelledOrder: AdminOrderNode = {
  id: "gid://shopify/Order/2",
  name: "#1002",
  cancelledAt: "2026-10-02T00:00:00Z",
  cancelReason: "CUSTOMER",
  closed: true,
  paymentGatewayNames: ["manual"],
  lineItems: { nodes: [] },
};

function render(path: string, Component: ComponentType, data: unknown): string {
  const Stub = createRoutesStub([{ id: "page", path, Component, loader: () => data }]);
  return renderToString(
    createElement(Stub, { initialEntries: [path], hydrationData: { loaderData: { page: data } } }),
  );
}

describe("orders page", () => {
  const data = {
    shopDomain: "test.myshopify.com",
    orders: [codOrder, cancelledOrder].map(mapAdminOrderToListItem),
    pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
    searchQuery: null,
    filters: defaultOrderFilters,
    sort: { column: "orderedAt", direction: "desc" },
    columns: ["stage", "name", "cod", "tags", "assignee"],
    workflow,
    recentOrdersOnly: false,
    views: [],
  };
  const html = render("/app/orders", OrdersPage, data);

  it("marks cancelled orders in the list", () => {
    expect(html).toContain("Cancelled");
  });

  it("shows columns in the arranged order and scrolls sideways", () => {
    const header = html.slice(html.indexOf("Select all orders"));
    const position = (label: string) => header.indexOf(`>${label}<`);
    expect(position("Stage")).toBeGreaterThan(-1);
    expect(position("Stage")).toBeLessThan(position("Order"));
    expect(position("Order")).toBeLessThan(position("COD"));
    expect(position("Tags")).toBeLessThan(position("Assigned to"));
    expect(html).toContain("overflow-x:auto");
  });

  it("offers the configured stages and shows only ordinary tags as tags", () => {
    expect(html).toContain('<s-option value="in-production">In production</s-option>');
    expect(html).toContain(">Priority<");
    expect(html).not.toContain(">stage:in-production<");
  });

  it("links uploaded artwork and hides internal properties", () => {
    expect(html).toContain('href="https://files.example/uploads/art.png"');
    expect(html).toMatch(/Name(<!-- -->)?: (<!-- -->)?Aarav/);
    expect(html).not.toContain("_uploadId");
  });

  it("explains the 60-day window only when the scope is missing", () => {
    expect(html).not.toContain("last 60 days");
    expect(render("/app/orders", OrdersPage, { ...data, recentOrdersOnly: true })).toContain(
      "last 60 days",
    );
  });
});

describe("order details page", () => {
  const page = (order: AdminOrderNode) =>
    render("/app/orders/:orderId", OrderDetailsPage, {
      shopDomain: "test.myshopify.com",
      shopifyOrderId: order.id,
      order,
      fetchError: null,
      workflow,
    });

  it("shows tracking, refunds, discount codes and the COD picker", () => {
    const html = page(codOrder);
    expect(html).toContain("DL123");
    expect(html).toContain('href="https://track.example/DL123"');
    expect(html).toContain("Damaged");
    expect(html).toContain("DIWALI10");
    expect(html).toContain("COD confirmation");
  });

  it("shows why an order was cancelled and no COD picker for prepaid orders", () => {
    const html = page(cancelledOrder);
    expect(html).toMatch(/Cancelled(<!-- -->)? \(customer\)/);
    expect(html).not.toContain("COD confirmation");
  });
});

describe("production summary page", () => {
  it("lists what is left to make", () => {
    const summary = buildProductionSummary([codOrder, cancelledOrder].map(mapAdminOrderToListItem));
    const html = render("/app/production", ProductionSummaryPage, {
      summary,
      truncated: false,
      filterQuery: "",
      itemsCsvQuery: "?format=items",
    });
    expect(html).toMatch(/2(<!-- -->)? unit/);
    expect(html).toContain("Custom Mug");
    expect(html).toContain("#1001");
    expect(html).not.toContain("#1002");
  });
});

describe("print page", () => {
  const orders = [codOrder].map((node) => ({
    ...mapAdminOrderToListItem(node),
    recipient: node.shippingAddress?.name ?? null,
    recipientPhone: node.shippingAddress?.phone ?? null,
  }));

  it("prints a job sheet with stage, assignee and artwork", () => {
    const html = render("/app/print", PrintPage, { orders, type: "jobsheet", workflow });
    expect(html).toContain("Job sheet");
    expect(html).toContain("In production");
    expect(html).toContain("Ravi Kumar");
    expect(html).toContain('<img class="artwork" src="https://files.example/uploads/art.png"');
    expect(html).not.toContain("_uploadId");
  });

  it("prints a packing slip with the recipient and the COD amount, without item prices", () => {
    const html = render("/app/print", PrintPage, { orders, type: "packing", workflow });
    expect(html).toContain("Packing slip");
    expect(html).toContain("Meera Nair");
    expect(html).toMatch(/collect (<!-- -->)?INR(<!-- -->)? (<!-- -->)?999\.00/);
  });
});

describe("settings page", () => {
  const data = {
    settings: { defaultSort: "orderedAt:desc", defaultViewId: "", rowsPerPage: 50 },
    workflow,
    views: [],
    billing: { enforced: false, active: null, priceLabel: "$2.99 per month", planUrl: "https://admin.shopify.com/x" },
  };

  it("shows the price and that billing is off in this environment", () => {
    const html = render("/app/settings", SettingsPage, data);
    expect(html).toContain("$2.99 per month");
    expect(html).toContain("Billing is not switched on");
  });

  it("offers the plan page when billing is on and there is no plan", () => {
    const html = render("/app/settings", SettingsPage, {
      ...data,
      billing: { ...data.billing, enforced: true, active: false },
    });
    expect(html).toContain("Choose plan");
    expect(html).toContain("No active plan");
  });
});
