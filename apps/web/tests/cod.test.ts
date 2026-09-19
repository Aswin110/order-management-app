import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  orderOpsMeta: {
    upsert: vi.fn(),
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
  });
});

describe("setCodStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts the overlay row so any Shopify order works without a sync", async () => {
    mocks.orderOpsMeta.upsert.mockResolvedValue({ codStatus: "VERIFIED" });
    await setCodStatus({
      shopId: "shop-1",
      shopifyOrderId: "gid://shopify/Order/1",
      codStatus: "VERIFIED",
    });
    expect(mocks.orderOpsMeta.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId_shopifyOrderId: { shopId: "shop-1", shopifyOrderId: "gid://shopify/Order/1" },
        },
        create: expect.objectContaining({ codStatus: "VERIFIED" }),
        update: { codStatus: "VERIFIED" },
      }),
    );
  });

  it("rejects invalid statuses before touching the database", async () => {
    await expect(
      setCodStatus({ shopId: "s", shopifyOrderId: "o", codStatus: "BOGUS" as never }),
    ).rejects.toThrow("Invalid COD status");
    expect(mocks.orderOpsMeta.upsert).not.toHaveBeenCalled();
  });
});
