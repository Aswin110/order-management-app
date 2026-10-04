// Line item properties (customAttributes) as a production team reads them.

import type { AdminLineItemCustomAttribute } from "./admin-orders";

/**
 * Themes and apps prefix a property key with "_" to hide it from customers;
 * those hold internal ids, not personalisation.
 */
export function isInternalProperty(key: string): boolean {
  return key.startsWith("_");
}

export function visibleAttributes(
  attributes: AdminLineItemCustomAttribute[],
  showInternal = false,
): AdminLineItemCustomAttribute[] {
  return showInternal ? attributes : attributes.filter((a) => !isInternalProperty(a.key));
}

/** True when the whole value is one http(s) link, e.g. uploaded artwork. */
export function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export function isImageUrl(value: string): boolean {
  if (!isUrl(value)) return false;
  const path = value.trim().split(/[?#]/)[0] ?? "";
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path);
}
