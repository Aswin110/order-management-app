import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  webhookEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  orderMetadata: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  shop: {
    upsert: vi.fn(),
  },
}));

vi.mock("../app/db.server", () => ({
  default: mocks,
  prisma: mocks,
}));

import { processOrderWebhook } from "../app/services/webhooks.server";

const payload = {
  id: "gid://shopify/Order/777",
  name: "#777",
  created_at: "2026-09-19T06:00:00Z",
  financial_status: "pending",
  fulfillment_status: null,
  total_price: "1500.00",
  currency: "INR",
  payment_gateway_names: ["Cash on Delivery"],
  line_items: [{}],
};

describe("processOrderWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shop.upsert.mockResolvedValue({ id: "shop-1", shopDomain: "store.myshopify.com" });
    mocks.orderMetadata.findUnique.mockResolvedValue(null);
    mocks.orderMetadata.upsert.mockResolvedValue({});
    mocks.webhookEvent.create.mockResolvedValue({});
    mocks.webhookEvent.update.mockResolvedValue({});
  });

  it("skips already-processed deliveries (idempotent)", async () => {
    mocks.webhookEvent.findUnique.mockResolvedValue({ status: "PROCESSED" });
    const result = await processOrderWebhook({
      shopDomain: "store.myshopify.com",
      topic: "ORDERS_CREATE",
      webhookId: "wh-1",
      payload,
    });
    expect(result.duplicate).toBe(true);
    expect(mocks.orderMetadata.upsert).not.toHaveBeenCalled();
  });

  it("records and processes new deliveries", async () => {
    mocks.webhookEvent.findUnique.mockResolvedValue(null);
    const result = await processOrderWebhook({
      shopDomain: "store.myshopify.com",
      topic: "ORDERS_CREATE",
      webhookId: "wh-2",
      payload,
    });
    expect(result.duplicate).toBe(false);
    expect(mocks.orderMetadata.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mocks.orderMetadata.upsert.mock.calls[0]?.[0];
    expect(upsertArgs.create.shopId).toBe("shop-1");
    expect(upsertArgs.create.codStatus).toBe("PENDING");
    expect(mocks.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
  });

  it("treats a unique-constraint race as a duplicate", async () => {
    mocks.webhookEvent.findUnique.mockResolvedValue(null);
    mocks.webhookEvent.create.mockRejectedValue(new Error("Unique constraint failed"));
    const result = await processOrderWebhook({
      shopDomain: "store.myshopify.com",
      topic: "ORDERS_CREATE",
      webhookId: "wh-3",
      payload,
    });
    expect(result).toEqual({ duplicate: true, raced: true });
    expect(mocks.orderMetadata.upsert).not.toHaveBeenCalled();
  });

  it("marks the event FAILED and rethrows when processing fails", async () => {
    mocks.webhookEvent.findUnique.mockResolvedValue(null);
    mocks.orderMetadata.upsert.mockRejectedValue(new Error("db down"));
    await expect(
      processOrderWebhook({
        shopDomain: "store.myshopify.com",
        topic: "ORDERS_CREATE",
        webhookId: "wh-4",
        payload,
      }),
    ).rejects.toThrow("db down");
    expect(mocks.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("preserves a manually verified COD status across order updates", async () => {
    mocks.webhookEvent.findUnique.mockResolvedValue(null);
    mocks.orderMetadata.findUnique.mockResolvedValue({ codStatus: "VERIFIED" });
    await processOrderWebhook({
      shopDomain: "store.myshopify.com",
      topic: "ORDERS_UPDATED",
      webhookId: "wh-5",
      payload,
    });
    const upsertArgs = mocks.orderMetadata.upsert.mock.calls[0]?.[0];
    expect(upsertArgs.create.codStatus).toBe("VERIFIED");
  });
});
