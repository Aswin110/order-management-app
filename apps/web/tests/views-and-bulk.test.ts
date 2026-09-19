import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  savedView: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  orderOpsMeta: { upsert: vi.fn(), updateMany: vi.fn() },
  orderNote: { create: vi.fn() },
  orderAssignment: { create: vi.fn() },
  staff: { findFirst: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: typeof mocks) => unknown) => fn(mocks)),
}));

vi.mock("../app/db.server", () => ({ default: mocks, prisma: mocks }));

import { createSavedView, duplicateSavedView, deleteSavedView } from "../app/services/views.server";
import { applyBulkAction, MAX_INLINE_BULK } from "../app/services/bulk.server";
import { defaultOrderFilters } from "@order-operations/shared";

function mockAdmin(userErrors: Array<{ message: string }> = []) {
  return {
    graphql: vi.fn(async () =>
      new Response(JSON.stringify({ data: { tagsAdd: { userErrors } } }), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  };
}

describe("saved views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a view with filters, sort, and columns", async () => {
    mocks.savedView.create.mockResolvedValue({ id: "v1" });
    await createSavedView({
      shopId: "shop-1",
      name: "Today's unfulfilled",
      filters: { ...defaultOrderFilters, fulfillment: "UNFULFILLED", dateRange: "TODAY" },
      columns: ["name", "items"],
    });
    expect(mocks.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: "shop-1", name: "Today's unfulfilled" }),
      }),
    );
  });

  it("duplicates a view with a copy suffix", async () => {
    mocks.savedView.findFirst.mockResolvedValue({
      id: "v1", shopId: "shop-1", name: "High Value", filters: {}, sort: null, columns: [],
    });
    mocks.savedView.create.mockResolvedValue({ id: "v2" });
    await duplicateSavedView("shop-1", "v1");
    expect(mocks.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "High Value (copy)" }) }),
    );
  });

  it("never deletes another shop's view (shop isolation)", async () => {
    mocks.savedView.findFirst.mockResolvedValue(null);
    await expect(deleteSavedView("shop-2", "v1")).rejects.toThrow("not found");
    expect(mocks.savedView.delete).not.toHaveBeenCalled();
  });
});

describe("bulk actions (inline, no worker)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds tags through the Shopify API for each selected order", async () => {
    const admin = mockAdmin();
    const result = await applyBulkAction({
      admin,
      shopId: "shop-1",
      shopifyOrderIds: ["gid://shopify/Order/1", "gid://shopify/Order/2"],
      action: { type: "ADD_TAG", tag: "Priority" },
    });
    expect(result.applied).toBe(2);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(admin.graphql).toHaveBeenCalledWith(expect.stringContaining("tagsAdd"), {
      variables: { id: "gid://shopify/Order/1", tags: ["Priority"] },
    });
  });

  it("surfaces Shopify userErrors", async () => {
    const admin = mockAdmin([{ message: "Tag is invalid" }]);
    await expect(
      applyBulkAction({
        admin,
        shopId: "s",
        shopifyOrderIds: ["gid://shopify/Order/1"],
        action: { type: "ADD_TAG", tag: "x" },
      }),
    ).rejects.toThrow("Tag is invalid");
  });

  it("rejects empty selections", async () => {
    await expect(
      applyBulkAction({
        admin: mockAdmin(), shopId: "s", shopifyOrderIds: [], action: { type: "UNASSIGN_STAFF" },
      }),
    ).rejects.toThrow("No orders selected");
  });

  it("caps bulk size at one page of orders", async () => {
    const ids = Array.from({ length: MAX_INLINE_BULK + 1 }, (_, i) => `gid://shopify/Order/${i}`);
    await expect(
      applyBulkAction({ admin: mockAdmin(), shopId: "s", shopifyOrderIds: ids, action: { type: "UNASSIGN_STAFF" } }),
    ).rejects.toThrow("Too many");
  });

  it("applies overlay actions without Shopify calls", async () => {
    const admin = mockAdmin();
    mocks.staff.findFirst.mockResolvedValue({ id: "staff-1" });
    mocks.orderAssignment.create.mockResolvedValue({});
    mocks.orderOpsMeta.upsert.mockResolvedValue({});
    const result = await applyBulkAction({
      admin,
      shopId: "shop-1",
      shopifyOrderIds: ["gid://shopify/Order/1"],
      action: { type: "ASSIGN_STAFF", staffId: "staff-1" },
    });
    expect(result.applied).toBe(1);
    expect(admin.graphql).not.toHaveBeenCalled();
    expect(mocks.orderOpsMeta.upsert).toHaveBeenCalled();
  });
});
