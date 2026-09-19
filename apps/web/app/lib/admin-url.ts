/** Extracts the numeric id from a Shopify GID like gid://shopify/Order/12345. */
export function numericId(gid: string): string {
  const match = gid.match(/\/(\d+)(?:\?.*)?$/);
  return match?.[1] ?? gid;
}

/** Builds the Shopify Admin URL for an order. */
export function adminOrderUrl(shopDomain: string, shopifyOrderGid: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/orders/${numericId(shopifyOrderGid)}`;
}
