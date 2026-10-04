// COD detection from Shopify payment gateway names.

const COD_GATEWAY_PATTERN = /cash.?on.?delivery|\bcod\b/i;

export function isCodOrder(gatewayNames: Array<string | null | undefined>): boolean {
  return gatewayNames.some((g) => g != null && COD_GATEWAY_PATTERN.test(g));
}

/**
 * Gateway names Shopify stores for cash on delivery. The order search
 * matches gateway names exactly, so the COD filter lists the known ones
 * rather than using the pattern above.
 */
export const COD_GATEWAY_NAMES = [
  "Cash on Delivery (COD)",
  "Cash on Delivery",
  "cash_on_delivery",
  "cod",
] as const;
