// Pure mapping from Shopify order payloads (Admin GraphQL nodes or
// webhook payloads) to our indexed OrderMetadata shape.

export interface MappedOrder {
  shopifyOrderId: string;
  name: string;
  orderedAt: Date;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  totalPrice: string | null;
  currency: string | null;
  itemCount: number;
  tags: string[];
  codStatus: "NOT_COD" | "PENDING" | "VERIFIED" | "FAILED" | "CANCELLED";
  riskLevel: string | null;
  shippingAddress: Record<string, unknown> | null;
  cancelledAt: Date | null;
}

interface ShopifyOrderLike {
  id: string;
  name?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  cancelledAt?: string | null;
  cancelled_at?: string | null;
  customer?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    defaultEmailAddress?: { emailAddress?: string | null } | null;
    defaultPhoneNumber?: { phoneNumber?: string | null } | null;
  } | null;
  email?: string | null;
  phone?: string | null;
  displayFinancialStatus?: string | null;
  financial_status?: string | null;
  displayFulfillmentStatus?: string | null;
  fulfillment_status?: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
  total_price?: string | null;
  currencyCode?: string | null;
  currency?: string | null;
  lineItems?: { nodes?: Array<unknown> } | null;
  line_items?: Array<unknown> | null;
  tags?: string[] | string | null;
  paymentGatewayNames?: string[] | null;
  gateway?: string | null;
  payment_gateway_names?: string[] | null;
  riskLevel?: string | null;
  shippingAddress?: Record<string, unknown> | null;
  shipping_address?: Record<string, unknown> | null;
}

const COD_GATEWAY_PATTERN = /cash.?on.?delivery|cod/i;

export function isCodOrder(gatewayNames: Array<string | null | undefined>): boolean {
  return gatewayNames.some((g) => g != null && COD_GATEWAY_PATTERN.test(g));
}

function customerNameOf(order: ShopifyOrderLike): string | null {
  const c = order.customer;
  if (!c) return null;
  if (c.displayName) return c.displayName;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function toUpperOrNull(value: string | null | undefined): string | null {
  return value ? value.toUpperCase().replace(/ /g, "_") : null;
}

/**
 * Maps either a GraphQL Admin API order node or a webhook/REST-style
 * payload into the indexed OrderMetadata fields. Never throws on missing
 * optional data; unknown fields become null.
 */
export function mapShopifyOrder(
  order: ShopifyOrderLike,
  existingCodStatus?: MappedOrder["codStatus"] | null,
): MappedOrder {
  const gatewayNames =
    order.paymentGatewayNames ?? order.payment_gateway_names ?? [order.gateway ?? null];
  const cod = isCodOrder(gatewayNames);
  const tags = Array.isArray(order.tags)
    ? order.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
    : typeof order.tags === "string"
      ? order.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  const itemCount = order.lineItems?.nodes
    ? order.lineItems.nodes.length
    : Array.isArray(order.line_items)
      ? order.line_items.length
      : 0;

  const codStatus: MappedOrder["codStatus"] = cod
    ? (existingCodStatus && existingCodStatus !== "NOT_COD"
        ? existingCodStatus
        : "PENDING")
    : "NOT_COD";

  return {
    shopifyOrderId: order.id,
    name: order.name ?? order.id,
    orderedAt: new Date(order.createdAt ?? order.created_at ?? Date.now()),
    customerName: customerNameOf(order),
    email: order.email ?? order.customer?.email ?? order.customer?.defaultEmailAddress?.emailAddress ?? null,
    phone: order.phone ?? order.customer?.phone ?? order.customer?.defaultPhoneNumber?.phoneNumber ?? null,
    financialStatus: toUpperOrNull(order.displayFinancialStatus ?? order.financial_status),
    fulfillmentStatus: toUpperOrNull(order.displayFulfillmentStatus ?? order.fulfillment_status),
    totalPrice: order.totalPriceSet?.shopMoney?.amount ?? order.total_price ?? null,
    currency: order.currencyCode ?? order.currency ?? null,
    itemCount,
    tags,
    codStatus,
    riskLevel: toUpperOrNull(order.riskLevel),
    shippingAddress: order.shippingAddress ?? order.shipping_address ?? null,
    cancelledAt: order.cancelledAt ?? order.cancelled_at
      ? new Date((order.cancelledAt ?? order.cancelled_at) as string)
      : null,
  };
}
