import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { AdminOrderNode, WorkflowGroup } from "@order-operations/shared";
import {
  COD_STATUSES,
  isCodOrder,
  plainTags,
  readWorkflow,
  visibleAttributes,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, workflowConfig } from "../services/settings.server";
import { fetchOrderDetails } from "../services/shopify-orders.server";
import { applyBulkAction } from "../services/bulk.server";
import { adminOrderUrl } from "../lib/admin-url";
import { FinancialStatusBadge, FulfillmentStatusBadge } from "../components/StatusBadges";
import { Customizations } from "../components/Customizations";
import { WorkflowSelect } from "../components/WorkflowSelect";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const workflow = workflowConfig(await getOrCreateSettings(shop.id));
  const shopifyOrderId = decodeURIComponent(params.orderId ?? "");

  let order: AdminOrderNode | null = null;
  let fetchError: string | null = null;
  try {
    order = await fetchOrderDetails(admin, shopifyOrderId);
    if (!order) fetchError = "Order not found in Shopify";
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Could not load order from Shopify";
  }

  return { shopDomain: session.shop, shopifyOrderId, order, fetchError, workflow };
};

const WORKFLOW_GROUPS: WorkflowGroup[] = ["stage", "assignee", "cod"];

// The only write on this page: moving the order's stage, assignee or COD
// confirmation, which is a tag change in Shopify.
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const shopifyOrderId = decodeURIComponent(params.orderId ?? "");
  const formData = await request.formData();

  try {
    const group = String(formData.get("group") ?? "") as WorkflowGroup;
    if (!WORKFLOW_GROUPS.includes(group)) throw new Error("Unknown workflow field");
    const value = String(formData.get("value") ?? "") || null;
    await applyBulkAction({
      admin,
      shopifyOrderIds: [shopifyOrderId],
      action: { type: "SET_WORKFLOW", group, value },
    });
    return { ok: true, message: "Saved" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
  }
};

function money(set: { shopMoney?: { amount?: string | null } | null } | null | undefined, currency: string) {
  const amount = set?.shopMoney?.amount;
  return amount ? `${currency} ${Number(amount).toLocaleString("en-IN")}` : "-";
}

function formatDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("en-IN") : "";
}

export default function OrderDetailsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();

  const order = data.order;
  const currency = order?.currencyCode ?? "";
  const lineItems = order?.lineItems?.nodes ?? [];
  const isCod = isCodOrder(order?.paymentGatewayNames ?? []);
  const tags = order?.tags ?? [];
  const workflow = readWorkflow(tags);
  const ordinaryTags = plainTags(tags);
  const fulfillments = order?.fulfillments ?? [];
  const refunds = order?.refunds ?? [];
  const discountCodes = order?.discountCodes ?? [];
  const saving = fetcher.state !== "idle";

  const setWorkflow = (group: WorkflowGroup, value: string | null) =>
    fetcher.submit({ group, value: value ?? "" }, { method: "post" });

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
      {order ? (
        <s-button
          slot="secondary-actions"
          href={`/app/print?type=jobsheet&ids=${encodeURIComponent(data.shopifyOrderId)}`}
        >
          Print job sheet
        </s-button>
      ) : null}

      {order?.createdAt ? (
        <s-paragraph color="subdued">Placed {formatDate(order.createdAt)}</s-paragraph>
      ) : null}

      {data.fetchError ? (
        <s-banner tone="warning">
          Live order data could not be loaded from Shopify: {data.fetchError}
        </s-banner>
      ) : null}
      {fetcher.data && !fetcher.data.ok ? (
        <s-banner tone="critical">{fetcher.data.message}</s-banner>
      ) : null}

      {order ? (
        <s-section heading="Workflow">
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <s-stack direction="block" gap="small-500">
              <s-text color="subdued">Stage</s-text>
              <WorkflowSelect
                label="Stage"
                value={workflow.stage}
                options={data.workflow.stages}
                emptyLabel="No stage"
                disabled={saving}
                onChange={(value) => setWorkflow("stage", value)}
              />
            </s-stack>
            <s-stack direction="block" gap="small-500">
              <s-text color="subdued">Assigned to</s-text>
              <WorkflowSelect
                label="Assigned to"
                value={workflow.assignee}
                options={data.workflow.staff}
                emptyLabel="Unassigned"
                disabled={saving}
                onChange={(value) => setWorkflow("assignee", value)}
              />
            </s-stack>
            {isCod ? (
              <s-stack direction="block" gap="small-500">
                <s-text color="subdued">COD confirmation</s-text>
                <WorkflowSelect
                  label="COD confirmation"
                  value={workflow.cod}
                  options={COD_STATUSES.map((s) => s.label)}
                  emptyLabel="Unconfirmed"
                  disabled={saving}
                  onChange={(value) => setWorkflow("cod", value)}
                />
              </s-stack>
            ) : null}
          </s-grid>
        </s-section>
      ) : null}

      {order ? (
        <s-section heading={`Items (${lineItems.reduce((sum, i) => sum + (i.quantity ?? 0), 0)})`}>
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="base">
              {lineItems.map((item) => {
                const customizations = visibleAttributes(
                  item.customAttributes ?? [],
                  data.workflow.showInternalProperties,
                );
                return (
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
                    {customizations.length ? <Customizations attributes={customizations} /> : null}
                  </s-stack>
                  <s-text>
                    {money(item.discountedTotalSet, currency)}
                    {"  "}({money(item.originalUnitPriceSet, currency)} each)
                  </s-text>
                </s-stack>
                );
              })}
            </s-stack>
            <s-divider />
            <s-stack direction="block" gap="small-500">
              {totalRow("Subtotal", money(order.subtotalPriceSet, currency))}
              {totalRow(
                discountCodes.length ? `Discounts (${discountCodes.join(", ")})` : "Discounts",
                `-${money(order.totalDiscountsSet, currency)}`,
              )}
              {totalRow("Shipping", money(order.totalShippingPriceSet, currency))}
              {totalRow("Tax", money(order.totalTaxSet, currency))}
              {totalRow("Total", money(order.totalPriceSet, currency), true)}
            </s-stack>
          </s-stack>
        </s-section>
      ) : null}

      {order ? (
        <s-section heading="Fulfillment and tracking">
          {fulfillments.length ? (
            <s-stack direction="block" gap="base">
              {fulfillments.map((fulfillment) => (
                <s-stack key={fulfillment.id} direction="block" gap="small-500">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-badge tone={fulfillment.displayStatus === "DELIVERED" ? "success" : "info"}>
                      {(fulfillment.displayStatus ?? "FULFILLED").replace(/_/g, " ")}
                    </s-badge>
                    <s-text color="subdued">
                      {fulfillment.totalQuantity ?? 0} item{fulfillment.totalQuantity === 1 ? "" : "s"} · {formatDate(fulfillment.createdAt)}
                    </s-text>
                  </s-stack>
                  {(fulfillment.trackingInfo ?? []).map((tracking, index) => (
                    <s-stack key={`${tracking.number}-${index}`} direction="inline" gap="small-200">
                      <s-text>{tracking.company ?? "Tracking"}:</s-text>
                      {tracking.url ? (
                        <s-link href={tracking.url} target="_blank">{tracking.number ?? tracking.url}</s-link>
                      ) : (
                        <s-text>{tracking.number ?? "-"}</s-text>
                      )}
                    </s-stack>
                  ))}
                  {fulfillment.deliveredAt ? (
                    <s-text color="subdued">Delivered {formatDate(fulfillment.deliveredAt)}</s-text>
                  ) : null}
                </s-stack>
              ))}
            </s-stack>
          ) : (
            <s-paragraph color="subdued">Nothing has been fulfilled yet.</s-paragraph>
          )}
        </s-section>
      ) : null}

      {refunds.length ? (
        <s-section heading="Refunds">
          <s-stack direction="block" gap="small-200">
            {refunds.map((refund) => (
              <s-stack key={refund.id} direction="block" gap="small-500">
                <s-stack direction="inline" gap="base" justifyContent="space-between">
                  <s-text>{formatDate(refund.createdAt)}</s-text>
                  <s-text type="strong">-{money(refund.totalRefundedSet, currency)}</s-text>
                </s-stack>
                {refund.note ? <s-text color="subdued">{refund.note}</s-text> : null}
              </s-stack>
            ))}
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
              {order.cancelledAt ? (
                <s-badge tone="critical">
                  Cancelled{order.cancelReason ? ` (${order.cancelReason.toLowerCase().replace(/_/g, " ")})` : ""}
                </s-badge>
              ) : order.closed ? (
                <s-badge tone="neutral">Archived</s-badge>
              ) : null}
            </s-stack>
            {ordinaryTags.length ? (
              <s-stack direction="inline" gap="small-500">
                {ordinaryTags.map((t) => <s-badge key={t} tone="neutral">{t}</s-badge>)}
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
