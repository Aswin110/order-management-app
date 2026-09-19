// COD detection from Shopify payment gateway names.

const COD_GATEWAY_PATTERN = /cash.?on.?delivery|\bcod\b/i;

export function isCodOrder(gatewayNames: Array<string | null | undefined>): boolean {
  return gatewayNames.some((g) => g != null && COD_GATEWAY_PATTERN.test(g));
}
