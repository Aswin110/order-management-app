import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adminGraphql, ShopifyThrottledError } from "../src/services/shopify-admin";

describe("adminGraphql", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const options = { shopDomain: "store.myshopify.com", accessToken: "token" };

  it("returns data on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { shop: { name: "Store" } } }),
    }));
    const data = await adminGraphql<{ shop: { name: string } }>(options, "{ shop { name } }");
    expect(data.shop.name).toBe("Store");
    expect(fetch).toHaveBeenCalledWith(
      "https://store.myshopify.com/admin/api/2025-10/graphql.json",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Shopify-Access-Token": "token" }),
      }),
    );
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { ok: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    const promise = adminGraphql(options, "{ }");
    await vi.runAllTimersAsync();
    const data = await promise;
    expect((data as { ok: boolean }).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on GraphQL errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: "Field 'nope' doesn't exist" }] }),
    }));
    await expect(adminGraphql(options, "{ nope }")).rejects.toThrow("Shopify GraphQL errors");
  });

  it("gives up after repeated throttling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}),
    }));
    const promise = adminGraphql(options, "{ }").catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await promise;
    expect(error).toBeInstanceOf(ShopifyThrottledError);
  });
});
