// Billing uses Shopify App Pricing (managed pricing): the plan and its price
// live in the Partner Dashboard, Shopify hosts the plan selection page, and
// the Partner API reports whether a shop has an active subscription. This
// app never creates charges itself.
//
// The check is enforced only when the Partner API variables are set, so
// local development and test deploys work without a plan.

interface AdminGraphql {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

const PARTNER_API_VERSION = "2026-07";

/** Shown in Settings. The real price is whatever the plan in the Partner Dashboard says. */
export const PLAN_PRICE_LABEL = "$2.99 per month";

// Only a confirmed subscription is cached, so a merchant who has just picked
// a plan is let in immediately and a cancellation is noticed within minutes.
const ACTIVE_TTL_MS = 5 * 60 * 1000;
const activeUntil = new Map<string, number>();

function partnerApiConfig() {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const accessToken = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  const appGid = process.env.SHOPIFY_APP_GID;
  return orgId && accessToken && appGid ? { orgId, accessToken, appGid } : null;
}

export function billingEnforced(): boolean {
  return partnerApiConfig() !== null;
}

/** Shopify's hosted page where the merchant picks or changes the plan. */
export function planSelectionUrl(shopDomain: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "order-operations";
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

const SHOP_ID_QUERY = `#graphql
  query ShopId {
    shop { id }
  }
`;

const ACTIVE_SUBSCRIPTION_QUERY = `
  query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) { billingPeriod }
  }
`;

/**
 * Whether the shop has an active subscription. Always true when billing is
 * not enforced. Throws if the Partner API cannot be reached, so an outage or
 * throttling never sends a paying merchant to the plan page.
 */
export async function hasActiveSubscription(
  admin: AdminGraphql,
  shopDomain: string,
): Promise<boolean> {
  const config = partnerApiConfig();
  if (!config) return true;
  if ((activeUntil.get(shopDomain) ?? 0) > Date.now()) return true;

  const shopBody = (await (await admin.graphql(SHOP_ID_QUERY)).json()) as {
    data?: { shop?: { id?: string } };
  };
  const shopId = shopBody.data?.shop?.id;
  if (!shopId) throw new Error("Could not read the shop id for the billing check");

  const response = await fetch(
    `https://partners.shopify.com/${config.orgId}/api/${PARTNER_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.accessToken,
      },
      body: JSON.stringify({
        query: ACTIVE_SUBSCRIPTION_QUERY,
        variables: { appId: config.appGid, shopId },
      }),
    },
  );
  const body = (await response.json()) as {
    data?: { activeSubscription?: unknown };
    errors?: unknown;
  };
  if (!response.ok || body.errors) {
    throw new Error(
      `Partner API billing check failed: ${JSON.stringify(body.errors ?? response.status)}`,
    );
  }

  const active = Boolean(body.data?.activeSubscription);
  if (active) activeUntil.set(shopDomain, Date.now() + ACTIVE_TTL_MS);
  else activeUntil.delete(shopDomain);
  return active;
}
