import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  savedView: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  orderMetadata: { findMany: vi.fn() },
}));

vi.mock("../app/db.server", () => ({ default: mocks, prisma: mocks }));

const enqueueMocks = vi.hoisted(() => ({ enqueueBulkAction: vi.fn() }));
vi.mock("../app/services/queues.server", () => enqueueMocks);

import { createSavedView, duplicateSavedView, deleteSavedView } from "../app/services/views.server";
import { applyBulkAction, resolveFilteredOrderIds } from "../app/services/bulk.server";
import { defaultOrderFilters } from "@order-operations/shared";

describe("saved views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a view with filters, sort, and columns", async () => {
    mocks.savedView.create.mockResolvedValue({ id: "v1" });
    await createSavedView({
      shopId: "shop-1",
      name: "Today's COD",
      filters: { ...defaultOrderFilters, cod: "COD", dateRange: "TODAY" },
      columns: ["name", "codStatus"],
    });
    expect(mocks.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopId: "shop-1", name: "Today's COD" }),
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

describe("bulk actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues bulk actions as background jobs", async () => {
    const result = await applyBulkAction({
      shopId: "shop-1",
      shopDomain: "store.myshopify.com",
      shopifyOrderIds: ["gid://shopify/Order/1", "gid://shopify/Order/2"],
      action: { type: "ADD_TAG", tag: "Priority" },
    });
    expect(result.queued).toBe(2);
    expect(enqueueMocks.enqueueBulkAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: { type: "ADD_TAG", tag: "Priority" } }),
    );
  });

  it("rejects empty selections", async () => {
    await expect(
      applyBulkAction({
        shopId: "s", shopDomain: "d", shopifyOrderIds: [], action: { type: "UNASSIGN_STAFF" },
      }),
    ).rejects.toThrow("No orders selected");
  });

  it("caps bulk size", async () => {
    const ids = Array.from({ length: 2001 }, (_, i) => `gid://shopify/Order/${i}`);
    await expect(
      applyBulkAction({ shopId: "s", shopDomain: "d", shopifyOrderIds: ids, action: { type: "UNASSIGN_STAFF" } }),
    ).rejects.toThrow("Too many");
  });

  it("resolves ids for a filter set without loading full rows", async () => {
    mocks.orderMetadata.findMany.mockResolvedValue([
      { shopifyOrderId: "gid://shopify/Order/1" },
      { shopifyOrderId: "gid://shopify/Order/2" },
    ]);
    const ids = await resolveFilteredOrderIds({
      shopId: "shop-1",
      filters: defaultOrderFilters,
      sort: { column: "orderedAt", direction: "desc" },
      highValueThreshold: 5000,
    });
    expect(ids).toEqual(["gid://shopify/Order/1", "gid://shopify/Order/2"]);
    expect(mocks.orderMetadata.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { shopifyOrderId: true } }),
    );
  });
});
