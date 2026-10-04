import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { applyBulkAction } from "../app/services/bulk.server";
import {
  billingEnforced,
  hasActiveSubscription,
  planSelectionUrl,
} from "../app/services/billing.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** An Admin API double that serves the given tags per order and records mutations. */
function mockAdmin(tagsById: Record<string, string[]>) {
  const mutations: Array<{ mutation: "tagsAdd" | "tagsRemove"; id: string; tags: string[] }> = [];
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    const variables = options?.variables ?? {};
    if (query.includes("OrderTags")) {
      const ids = variables.ids as string[];
      return json({ data: { nodes: ids.map((id) => ({ id, tags: tagsById[id] ?? [] })) } });
    }
    const mutation = query.includes("tagsRemove") ? "tagsRemove" : "tagsAdd";
    mutations.push({ mutation, id: variables.id as string, tags: variables.tags as string[] });
    return json({ data: { [mutation]: { userErrors: [] } } });
  });
  return { graphql, mutations };
}

describe("workflow changes (tag swaps)", () => {
  it("replaces the previous stage on each order", async () => {
    const admin = mockAdmin({
      "gid://shopify/Order/1": ["Priority", "stage:to-make"],
      "gid://shopify/Order/2": [],
    });
    const result = await applyBulkAction({
      admin,
      shopifyOrderIds: ["gid://shopify/Order/1", "gid://shopify/Order/2"],
      action: { type: "SET_WORKFLOW", group: "stage", value: "in-production" },
    });
    expect(result.applied).toBe(2);
    expect(admin.mutations).toEqual([
      { mutation: "tagsRemove", id: "gid://shopify/Order/1", tags: ["stage:to-make"] },
      { mutation: "tagsAdd", id: "gid://shopify/Order/1", tags: ["stage:in-production"] },
      { mutation: "tagsAdd", id: "gid://shopify/Order/2", tags: ["stage:in-production"] },
    ]);
  });

  it("writes nothing when the order is already at that value", async () => {
    const admin = mockAdmin({ "gid://shopify/Order/1": ["assigned:ravi-kumar"] });
    await applyBulkAction({
      admin,
      shopifyOrderIds: ["gid://shopify/Order/1"],
      action: { type: "SET_WORKFLOW", group: "assignee", value: "Ravi Kumar" },
    });
    expect(admin.mutations).toEqual([]);
  });

  it("clears the value, leaving other tags alone", async () => {
    const admin = mockAdmin({ "gid://shopify/Order/1": ["Priority", "cod:confirmed", "stage:packed"] });
    await applyBulkAction({
      admin,
      shopifyOrderIds: ["gid://shopify/Order/1"],
      action: { type: "SET_WORKFLOW", group: "cod", value: null },
    });
    expect(admin.mutations).toEqual([
      { mutation: "tagsRemove", id: "gid://shopify/Order/1", tags: ["cod:confirmed"] },
    ]);
  });

  it("rejects a value that would make an empty tag", async () => {
    const admin = mockAdmin({});
    await expect(
      applyBulkAction({
        admin,
        shopifyOrderIds: ["gid://shopify/Order/1"],
        action: { type: "SET_WORKFLOW", group: "stage", value: "!!!" },
      }),
    ).rejects.toThrow("cannot be empty");
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});

describe("billing (Shopify App Pricing)", () => {
  const admin = { graphql: vi.fn(async () => json({ data: { shop: { id: "gid://shopify/Shop/1" } } })) };
  const partnerApi = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", partnerApi);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const enableBilling = () => {
    vi.stubEnv("SHOPIFY_PARTNER_ORG_ID", "123");
    vi.stubEnv("SHOPIFY_PARTNER_API_ACCESS_TOKEN", "token");
    vi.stubEnv("SHOPIFY_APP_GID", "gid://shopify/App/9");
  };

  it("is not enforced, and lets every shop in, without the Partner API variables", async () => {
    expect(billingEnforced()).toBe(false);
    expect(await hasActiveSubscription(admin, "a.myshopify.com")).toBe(true);
    expect(partnerApi).not.toHaveBeenCalled();
  });

  it("reports a shop with no subscription as inactive, and re-checks next time", async () => {
    enableBilling();
    partnerApi.mockImplementation(async () => json({ data: { activeSubscription: null } }));
    expect(await hasActiveSubscription(admin, "b.myshopify.com")).toBe(false);
    expect(await hasActiveSubscription(admin, "b.myshopify.com")).toBe(false);
    expect(partnerApi).toHaveBeenCalledTimes(2);
  });

  it("caches a confirmed subscription", async () => {
    enableBilling();
    partnerApi.mockImplementation(async () => json({ data: { activeSubscription: { billingPeriod: "MONTHLY" } } }));
    expect(await hasActiveSubscription(admin, "c.myshopify.com")).toBe(true);
    expect(await hasActiveSubscription(admin, "c.myshopify.com")).toBe(true);
    expect(partnerApi).toHaveBeenCalledTimes(1);
    expect(partnerApi.mock.calls[0]![0]).toBe(
      "https://partners.shopify.com/123/api/2026-07/graphql.json",
    );
  });

  it("throws rather than locking a shop out when the Partner API fails", async () => {
    enableBilling();
    partnerApi.mockImplementation(async () => json({ errors: [{ message: "Throttled" }] }, 429));
    await expect(hasActiveSubscription(admin, "d.myshopify.com")).rejects.toThrow("billing check failed");
  });

  it("builds the hosted plan page URL from the store and app handles", () => {
    expect(planSelectionUrl("cool-shop.myshopify.com")).toBe(
      "https://admin.shopify.com/store/cool-shop/charges/order-operations/pricing_plans",
    );
    vi.stubEnv("SHOPIFY_APP_HANDLE", "my-dev-app");
    expect(planSelectionUrl("cool-shop.myshopify.com")).toContain("/charges/my-dev-app/");
  });
});
