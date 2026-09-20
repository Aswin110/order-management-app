// Pure mapping from Shopify Admin GraphQL order nodes to the flat,
// serializable shapes the UI renders. No database and no network here:
// the same mapper is unit-tested and shared by the list page, detail
// page, print view, and CSV export. Every field comes from Shopify -
// the app stores nothing about an order.

import { isCodOrder } from "./cod";

export interface AdminMoneySet {
  shopMoney?: { amount?: string | null; currencyCode?: string | null } | null;
}

export interface AdminLineItemCustomAttribute {
  key: string;
  value: string;
}

export interface AdminLineItemNode {
  id: string;
  title?: string | null;
  variantTitle?: string | null;
  quantity?: number | null;
  sku?: string | null;
  vendor?: string | null;
  unfulfilledQuantity?: number | null;
  requiresShipping?: boolean | null;
  image?: { url?: string | null; altText?: string | null } | null;
  originalUnitPriceSet?: AdminMoneySet | null;
  discountedTotalSet?: AdminMoneySet | null;
  totalDiscountSet?: AdminMoneySet | null;
  customAttributes?: AdminLineItemCustomAttribute[] | null;
}

export interface AdminOrderNode {
  id: string;
  name?: string | null;
  createdAt?: string | null;
  processedAt?: string | null;
  cancelledAt?: string | null;
  email?: string | null;
  phone?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  currencyCode?: string | null;
  totalPriceSet?: AdminMoneySet | null;
  subtotalPriceSet?: AdminMoneySet | null;
  totalDiscountsSet?: AdminMoneySet | null;
  totalShippingPriceSet?: AdminMoneySet | null;
  totalTaxSet?: AdminMoneySet | null;
  tags?: string[] | null;
  note?: string | null;
  paymentGatewayNames?: Array<string | null> | null;
  shippingLine?: { title?: string | null } | null;
  customer?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  shippingAddress?: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    provinceCode?: string | null;
    zip?: string | null;
    countryCodeV2?: string | null;
    phone?: string | null;
  } | null;
  lineItems?: {
    nodes?: AdminLineItemNode[] | null;
    pageInfo?: { hasNextPage?: boolean | null } | null;
  } | null;
}

export interface OrderListItem {
  shopifyOrderId: string;
  name: string;
  orderedAt: string | null;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  totalPrice: string | null;
  currency: string | null;
  itemCount: number;
  items: OrderLineItem[];
  hasMoreItems: boolean;
  tags: string[];
  /** Derived from Shopify's payment gateway names, not stored anywhere. */
  cod: boolean;
  cancelledAt: string | null;
  /** The merchant-facing note on the Shopify order. */
  note: string | null;
  /** "City, Province, Country" from the shipping address. */
  shipTo: string | null;
  /** Full shipping address on one line, for print and CSV. */
  shipToFull: string | null;
  /** Gateway names as shown in the Shopify admin, e.g. "Cash on Delivery". */
  paymentMethod: string | null;
  /** The shipping rate the customer chose, e.g. "Standard". */
  deliveryMethod: string | null;
}

export interface OrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  sku: string | null;
  /** Product vendor, useful when work is split across makers or suppliers. */
  vendor: string | null;
  /** How many of this line still have to be made and shipped. */
  unfulfilledQuantity: number;
  /** false for digital goods, which need no production or packing. */
  requiresShipping: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  /** Discount applied to this line, if any. */
  lineDiscount: string | null;
  customAttributes: AdminLineItemCustomAttribute[];
}

function shipToOf(order: AdminOrderNode): string | null {
  const a = order.shippingAddress;
  if (!a) return null;
  const parts = [a.city, a.provinceCode, a.countryCodeV2].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function shipToFullOf(order: AdminOrderNode): string | null {
  const a = order.shippingAddress;
  if (!a) return null;
  const parts = [a.address1, a.address2, a.city, a.provinceCode, a.zip, a.countryCodeV2]
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function customerNameOf(order: AdminOrderNode): string | null {
  const c = order.customer;
  if (!c) return null;
  if (c.displayName) return c.displayName;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function mapLineItem(item: AdminLineItemNode): OrderLineItem {
  const quantity = item.quantity ?? 0;
  const discount = item.totalDiscountSet?.shopMoney?.amount ?? null;
  return {
    id: item.id,
    title: item.title ?? "Untitled item",
    variantTitle: item.variantTitle || null,
    quantity,
    sku: item.sku || null,
    vendor: item.vendor?.trim() || null,
    // Shopify omits the field on older orders; assume nothing is made yet.
    unfulfilledQuantity: item.unfulfilledQuantity ?? quantity,
    requiresShipping: item.requiresShipping ?? true,
    imageUrl: item.image?.url ?? null,
    imageAlt: item.image?.altText ?? item.title ?? null,
    unitPrice: item.originalUnitPriceSet?.shopMoney?.amount ?? null,
    lineTotal: item.discountedTotalSet?.shopMoney?.amount ?? null,
    lineDiscount: discount && Number(discount) > 0 ? discount : null,
    customAttributes: (item.customAttributes ?? []).filter(
      (a): a is AdminLineItemCustomAttribute => Boolean(a?.key),
    ),
  };
}

/**
 * Maps one live Admin API order node into the flat row the orders list
 * renders. Never throws on missing optional data.
 */
export function mapAdminOrderToListItem(order: AdminOrderNode): OrderListItem {
  const nodes = order.lineItems?.nodes ?? [];
  const items = nodes.map(mapLineItem);

  return {
    shopifyOrderId: order.id,
    name: order.name ?? order.id,
    orderedAt: order.createdAt ?? order.processedAt ?? null,
    customerName: customerNameOf(order),
    email: order.email ?? order.customer?.email ?? null,
    phone: order.phone ?? order.customer?.phone ?? null,
    financialStatus: order.displayFinancialStatus ?? null,
    fulfillmentStatus: order.displayFulfillmentStatus ?? null,
    totalPrice: order.totalPriceSet?.shopMoney?.amount ?? null,
    currency: order.totalPriceSet?.shopMoney?.currencyCode ?? order.currencyCode ?? null,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    items,
    hasMoreItems: Boolean(order.lineItems?.pageInfo?.hasNextPage),
    tags: (order.tags ?? []).filter((t): t is string => typeof t === "string" && t.length > 0),
    cod: isCodOrder(order.paymentGatewayNames ?? []),
    cancelledAt: order.cancelledAt ?? null,
    note: order.note?.trim() || null,
    shipTo: shipToOf(order),
    shipToFull: shipToFullOf(order),
    paymentMethod:
      (order.paymentGatewayNames ?? []).filter(Boolean).join(", ") || null,
    deliveryMethod: order.shippingLine?.title?.trim() || null,
  };
}

/** One-line item summary, e.g. "2 x Tee (M)". Used in print and CSV. */
export function lineItemSummary(item: OrderLineItem): string {
  const variant = item.variantTitle ? ` (${item.variantTitle})` : "";
  return `${item.quantity} x ${item.title}${variant}`;
}
