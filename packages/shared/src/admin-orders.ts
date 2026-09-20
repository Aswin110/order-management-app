// Pure mapping from Shopify Admin GraphQL order nodes to the flat,
// serializable shapes the UI renders. No database and no network here:
// the same mapper is unit-tested and shared by the list page, detail
// page, print view, and CSV export.

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
  image?: { url?: string | null; altText?: string | null } | null;
  originalUnitPriceSet?: AdminMoneySet | null;
  discountedTotalSet?: AdminMoneySet | null;
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

/** App-internal operational data overlaid onto the live Shopify order. */
export interface OrderOpsOverlayData {
  codStatus: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  notesCount: number;
  latestNote: string | null;
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
  cod: boolean;
  codStatus: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  notesCount: number;
  latestNote: string | null;
  cancelledAt: string | null;
}

export interface OrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  sku: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  customAttributes: AdminLineItemCustomAttribute[];
}

function customerNameOf(order: AdminOrderNode): string | null {
  const c = order.customer;
  if (!c) return null;
  if (c.displayName) return c.displayName;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function mapLineItem(item: AdminLineItemNode): OrderLineItem {
  return {
    id: item.id,
    title: item.title ?? "Untitled item",
    variantTitle: item.variantTitle || null,
    quantity: item.quantity ?? 0,
    sku: item.sku || null,
    imageUrl: item.image?.url ?? null,
    imageAlt: item.image?.altText ?? item.title ?? null,
    unitPrice: item.originalUnitPriceSet?.shopMoney?.amount ?? null,
    lineTotal: item.discountedTotalSet?.shopMoney?.amount ?? null,
    customAttributes: (item.customAttributes ?? []).filter(
      (a): a is AdminLineItemCustomAttribute => Boolean(a?.key),
    ),
  };
}

const DEFAULT_OVERLAY: OrderOpsOverlayData = {
  codStatus: "NOT_COD",
  assignedStaffId: null,
  assignedStaffName: null,
  notesCount: 0,
  latestNote: null,
};

/**
 * Maps one live Admin API order node plus its operational overlay into the
 * flat row the orders list renders. Never throws on missing optional data.
 */
export function mapAdminOrderToListItem(
  order: AdminOrderNode,
  overlay?: OrderOpsOverlayData | null,
): OrderListItem {
  const o = overlay ?? DEFAULT_OVERLAY;
  const nodes = order.lineItems?.nodes ?? [];
  const items = nodes.map(mapLineItem);
  const gatewayNames = order.paymentGatewayNames ?? [];
  const cod = isCodOrder(gatewayNames);

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
    cod,
    // An order is only shown as COD-tracked when the gateway says COD.
    codStatus: cod ? (o.codStatus === "NOT_COD" ? "PENDING" : o.codStatus) : o.codStatus,
    assignedStaffId: o.assignedStaffId,
    assignedStaffName: o.assignedStaffName,
    notesCount: o.notesCount,
    latestNote: o.latestNote,
    cancelledAt: order.cancelledAt ?? null,
  };
}

/** One-line item summary, e.g. "2 x Tee (M)". Used in print and CSV. */
export function lineItemSummary(item: OrderLineItem): string {
  const variant = item.variantTitle ? ` (${item.variantTitle})` : "";
  return `${item.quantity} x ${item.title}${variant}`;
}
