import { describe, it, expect } from "vitest";
import { buildProductionSummary } from "../src/production";
import { mapAdminOrderToListItem, type AdminOrderNode } from "../src/admin-orders";
import { isImageUrl, isUrl, visibleAttributes } from "../src/properties";

const order = (name: string, extra: Partial<AdminOrderNode>) =>
  mapAdminOrderToListItem({ id: `gid://shopify/Order/${name}`, name, ...extra });

const mug = (quantity: number, unfulfilledQuantity: number, name: string) => ({
  id: `li-${name}-${quantity}`,
  title: "Custom Mug",
  variantTitle: "White",
  sku: "MUG-W",
  quantity,
  unfulfilledQuantity,
  customAttributes: [
    { key: "Name", value: name },
    { key: "_uploadId", value: `${name}-${quantity}` },
  ],
});

describe("buildProductionSummary", () => {
  it("totals identical work across orders and keeps different personalisation apart", () => {
    const summary = buildProductionSummary([
      order("#1", { lineItems: { nodes: [mug(2, 2, "Aarav")] } }),
      order("#2", { lineItems: { nodes: [mug(1, 1, "Aarav"), mug(3, 3, "Diya")] } }),
    ]);
    expect(summary.rows.map((r) => [r.customizations[0]!.value, r.quantity, r.orders])).toEqual([
      ["Aarav", 3, ["#1", "#2"]],
      ["Diya", 3, ["#2"]],
    ]);
    expect(summary.totalUnits).toBe(6);
    expect(summary.orderCount).toBe(2);
  });

  it("counts only what is still to make", () => {
    const summary = buildProductionSummary([
      order("#1", { lineItems: { nodes: [mug(5, 2, "Aarav")] } }),
      order("#2", { lineItems: { nodes: [mug(1, 0, "Aarav")] } }),
    ]);
    expect(summary.totalUnits).toBe(2);
    expect(summary.orderCount).toBe(1);
  });

  it("skips cancelled orders and digital goods", () => {
    const summary = buildProductionSummary([
      order("#1", { cancelledAt: "2026-10-01T00:00:00Z", lineItems: { nodes: [mug(2, 2, "A")] } }),
      order("#2", {
        lineItems: { nodes: [{ id: "d1", title: "Gift card", quantity: 1, requiresShipping: false }] },
      }),
    ]);
    expect(summary.rows).toEqual([]);
    expect(summary.orderCount).toBe(0);
  });

  it("does not split rows on internal properties unless they are shown", () => {
    const orders = [
      order("#1", { lineItems: { nodes: [mug(1, 1, "Aarav")] } }),
      order("#2", { lineItems: { nodes: [mug(2, 2, "Aarav")] } }),
    ];
    expect(buildProductionSummary(orders).rows).toHaveLength(1);
    expect(buildProductionSummary(orders, { showInternal: true }).rows).toHaveLength(2);
  });
});

describe("line item properties", () => {
  it("hides underscore-prefixed properties by default", () => {
    const attrs = [
      { key: "Name", value: "Aarav" },
      { key: "_uploadId", value: "abc" },
    ];
    expect(visibleAttributes(attrs)).toEqual([{ key: "Name", value: "Aarav" }]);
    expect(visibleAttributes(attrs, true)).toHaveLength(2);
  });

  it("recognises links and image links", () => {
    expect(isUrl("https://files.example/artwork.pdf")).toBe(true);
    expect(isUrl("see https://files.example/a.png")).toBe(false);
    expect(isImageUrl("https://cdn.example/uploads/photo.JPG?v=2")).toBe(true);
    expect(isImageUrl("https://files.example/artwork.pdf")).toBe(false);
    expect(isImageUrl("Happy Birthday")).toBe(false);
  });
});
