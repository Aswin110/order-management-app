import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { AdminOrderNode } from "@order-operations/shared";
import { isCodOrder } from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { fetchOrderDetails } from "../services/shopify-orders.server";
import { adminOrderUrl } from "../lib/admin-url";
import { FinancialStatusBadge, FulfillmentStatusBadge } from "../components/StatusBadges";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopifyOrderId = decodeURIComponent(params.orderId ?? "");

  let order: AdminOrderNode | null = null;
  let fetchError: string | null = null;
  try {
    order = await fetchOrderDetails(admin, shopifyOrderId);
    if (!order) fetchError = "Order not found in Shopify";
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Could not load order from Shopify";
  }

  return { shopDomain: session.shop, shopifyOrderId, order, fetchError };
};

function money(set: { shopMoney?: { amount?: string | null } | null } | null | undefined, currency: string) {
  const amount = set?.shopMoney?.amount;
  return amount ? `${currency} ${Number(amount).toLocaleString("en-IN")}` : "-";
}

export default function OrderDetailsPage() {
  const data = useLoaderData<typeof loader>();

  const order = data.order;
  const currency = order?.currencyCode ?? "";
  const lineItems = order?.lineItems?.nodes ?? [];
  const isCod = isCodOrder(order?.paymentGatewayNames ?? []);

  const totalRow = (label: string, value: string, strong = false) => (
    <s-stack direction="inline" gap="base" justifyContent="space-between">
      {strong ? <s-text type="strong">{label}</s-text> : <s-text color="subdued">{label}</s-text>}
      {strong ? <s-text type="strong">{value}</s-text> : <s-text>{value}</s-text>}
    </s-stack>
  );

  return (
    <s-page heading={order?.name ?? "Order"}>
      <s-link slot="breadcrumb-actions" href="/app/orders">Orders</s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => window.open(adminOrderUrl(data.shopDomain, data.shopifyOrderId), "_blank")}
      >
        Open in Shopify Admin
      </s-button>

      {order?.createdAt ? (
        <s-paragraph color="subdued">
          Placed {new Date(order.createdAt).toLocaleString("en-IN")}
        </s-paragraph>
      ) : null}

      {data.fetchError ? (
        <s-banner tone="warning">
          Live order data could not be loaded from Shopify: {data.fetchError}
        </s-banner>
      ) : null}

      {order ? (
        <s-section heading={`Items (${lineItems.reduce((sum, i) => sum + (i.quantity ?? 0), 0)})`}>
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="base">
              {lineItems.map((item) => (
                <s-stack key={item.id} direction="inline" gap="base" alignItems="start">
                  {item.image?.url ? (
                    <s-thumbnail src={item.image.url} alt={item.image.altText ?? item.title ?? ""} size="large" />
                  ) : null}
                  <s-stack direction="block" gap="small-500">
                    <s-text type="strong">
                      {item.quantity} × {item.title}
                    </s-text>
                    {item.variantTitle ? <s-text color="subdued">{item.variantTitle}</s-text> : null}
                    {item.vendor ? <s-text color="subdued">{item.vendor}</s-text> : null}
                    {item.sku ? <s-text color="subdued">SKU: {item.sku}</s-text> : null}
                    <s-stack direction="inline" gap="small-500">
                      {(item.unfulfilledQuantity ?? item.quantity ?? 0) > 0 ? (
                        <s-badge tone="warning">
                          {item.unfulfilledQuantity ?? item.quantity} to make
                        </s-badge>
                      ) : (
                        <s-badge tone="success">Fulfilled</s-badge>
                      )}
                      {item.requiresShipping === false ? (
                        <s-badge tone="info">Digital</s-badge>
                      ) : null}
                    </s-stack>
                    {(item.customAttributes ?? []).length ? (
                      <s-stack direction="block" gap="small-500">
                        {(item.customAttributes ?? []).map((attr) => (
                          <s-text key={attr.key} color="subdued">
                            {attr.key}: {attr.value}
                          </s-text>
                        ))}
                      </s-stack>
                    ) : null}
                  </s-stack>
                  <s-text>
                    {money(item.discountedTotalSet, currency)}
                    {"  "}({money(item.originalUnitPriceSet, currency)} each)
                  </s-text>
                </s-stack>
              ))}
            </s-stack>
            <s-divider />
            <s-stack direction="block" gap="small-500">
              {totalRow("Subtotal", money(order.subtotalPriceSet, currency))}
              {totalRow("Discounts", `-${money(order.totalDiscountsSet, currency)}`)}
              {totalRow("Shipping", money(order.totalShippingPriceSet, currency))}
              {totalRow("Tax", money(order.totalTaxSet, currency))}
              {totalRow("Total", money(order.totalPriceSet, currency), true)}
            </s-stack>
          </s-stack>
        </s-section>
      ) : null}

      {order ? (
        <s-section heading="Customer">
          <s-stack direction="block" gap="small-200">
            <s-paragraph>{order.customer?.displayName ?? "Guest"}</s-paragraph>
            {order.customer?.email || order.email ? (
              <s-paragraph color="subdued">{order.customer?.email ?? order.email}</s-paragraph>
            ) : null}
            {order.customer?.phone || order.phone ? (
              <s-paragraph color="subdued">{order.customer?.phone ?? order.phone}</s-paragraph>
            ) : null}
            <s-divider />
            <s-stack direction="inline" gap="small-200">
              <FinancialStatusBadge status={order.displayFinancialStatus ?? null} />
              <FulfillmentStatusBadge status={order.displayFulfillmentStatus ?? null} />
              {isCod ? <s-badge tone="warning">COD</s-badge> : null}
            </s-stack>
            {order.cancelledAt ? <s-badge tone="critical">Cancelled</s-badge> : null}
            {order.tags?.length ? (
              <s-stack direction="inline" gap="small-500">
                {order.tags.map((t) => <s-badge key={t} tone="neutral">{t}</s-badge>)}
              </s-stack>
            ) : null}
            {order.note ? (
              <s-paragraph color="subdued">Order note: {order.note}</s-paragraph>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}

      {order?.shippingAddress ? (
        <s-section heading="Shipping address">
          <s-stack direction="block" gap="small-500">
            <s-paragraph>{order.shippingAddress.name}</s-paragraph>
            <s-paragraph color="subdued">
              {[order.shippingAddress.address1, order.shippingAddress.address2, order.shippingAddress.city, order.shippingAddress.provinceCode, order.shippingAddress.zip, order.shippingAddress.countryCodeV2].filter(Boolean).join(", ")}
            </s-paragraph>
            {order.shippingAddress.phone ? (
              <s-paragraph color="subdued">{order.shippingAddress.phone}</s-paragraph>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
