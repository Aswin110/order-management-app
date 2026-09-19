import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  orderMetadata: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../app/db.server", () => ({ default: mocks, prisma: mocks }));

import { setCodStatus, isValidCodStatus } from "../app/services/cod.server";

describe("isValidCodStatus", () => {
  it("accepts the five COD states", () => {
    for (const s of ["NOT_COD", "PENDING", "VERIFIED", "FAILED", "CANCELLED"]) {
      expect(isValidCodStatus(s)).toBe(true);
    }
  });
  it("rejects anything else", () => {
    expect(isValidCodStatus("VERIFIDE")).toBe(false);
    expect(isValidCodStatus("")).toBe(false);
  });
});

describe("setCodStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the status for an order in the same shop", async () => {
    mocks.orderMetadata.findUnique.mockResolvedValue({ id: "row-1" });
    mocks.orderMetadata.update.mockResolvedValue({ codStatus: "VERIFIED" });
    await setCodStatus({ shopId: "shop-1", shopifyOrderId: "gid://shopify/Order/1", codStatus: "VERIFIED" });
    expect(mocks.orderMetadata.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId_shopifyOrderId: { shopId: "shop-1", shopifyOrderId: "gid://shopify/Order/1" } },
      }),
    );
    expect(mocks.orderMetadata.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row-1" }, data: { codStatus: "VERIFIED" } }),
    );
  });

  it("rejects invalid statuses", async () => {
    await expect(
      setCodStatus({ shopId: "shop-1", shopifyOrderId: "x", codStatus: "WRONG" as never }),
    ).rejects.toThrow("Invalid COD status");
  });

  it("rejects orders from another shop (shop isolation)", async () => {
    mocks.orderMetadata.findUnique.mockResolvedValue(null);
    await expect(
      setCodStatus({ shopId: "shop-2", shopifyOrderId: "gid://shopify/Order/1", codStatus: "VERIFIED" }),
    ).rejects.toThrow("Order not found");
    expect(mocks.orderMetadata.update).not.toHaveBeenCalled();
  });
});
