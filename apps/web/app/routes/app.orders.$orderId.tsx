import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../services/shop.server";
import { listOrderNotes, addOrderNote, deleteOrderNote } from "../services/notes.server";
import { setCodStatus } from "../services/cod.server";
import { listStaff, assignOrder, unassignOrder } from "../services/staff.server";
import { adminOrderUrl } from "../lib/admin-url";
import { CodBadge } from "../components/CodBadge";
import { FinancialStatusBadge, FulfillmentStatusBadge, RiskBadge } from "../components/StatusBadges";
import type { CodStatus } from "@prisma/client";

const ORDER_QUERY = `#graphql
  query OrderDetails($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      cancelledAt
      email
      phone
      displayFinancialStatus
      displayFulfillmentStatus
      currencyCode
      tags
      riskLevel
      subtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalPriceSet { shopMoney { amount } }
      customer { displayName email phone }
      shippingAddress {
        name address1 address2 city provinceCode zip countryCodeV2 phone
      }
      lineItems(first: 100) {
        nodes {
          id
          title
          variantTitle
          quantity
          originalUnitPriceSet { shopMoney { amount } }
          discountedTotalSet { shopMoney { amount } }
        }
      }
    }
  }
`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const shopifyOrderId = decodeURIComponent(params.orderId ?? "");

  const [local, notes, staff] = await Promise.all([
    prisma.orderMetadata.findUnique({
      where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId } },
      include: { assignedStaff: true },
    }),
    listOrderNotes(shop.id, shopifyOrderId),
    listStaff(shop.id),
  ]);

  let order: Record<string, never> | null = null;
  let fetchError: string | null = null;
  try {
    const response = await admin.graphql(ORDER_QUERY, { variables: { id: shopifyOrderId } });
    const body = await response.json();
    order = (body.data?.order ?? null) as never;
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Could not load order from Shopify";
  }

  return {
    shopDomain: session.shop,
    shopifyOrderId,
    order,
    fetchError,
    local: local
      ? {
          codStatus: local.codStatus,
          assignedStaffId: local.assignedStaffId,
          assignedStaffName: local.assignedStaff?.name ?? null,
          notesCount: local.notesCount,
        }
      : null,
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      authorName: n.author?.name ?? "Unknown",
      createdAt: n.createdAt.toISOString(),
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name })),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const shopifyOrderId = decodeURIComponent(params.orderId ?? "");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "addNote") {
      await addOrderNote({
        shopId: shop.id,
        shopifyOrderId,
        content: String(formData.get("content") ?? ""),
      });
      return { ok: true, message: "Note added" };
    }
    if (intent === "deleteNote") {
      await deleteOrderNote(shop.id, String(formData.get("noteId")));
      return { ok: true, message: "Note deleted" };
    }
    if (intent === "setCod") {
      await setCodStatus({
        shopId: shop.id,
        shopifyOrderId,
        codStatus: String(formData.get("codStatus")) as CodStatus,
      });
      return { ok: true, message: "COD status updated" };
    }
    if (intent === "assign") {
      await assignOrder({
        shopId: shop.id,
        shopifyOrderId,
        staffId: String(formData.get("staffId")),
      });
      return { ok: true, message: "Order assigned" };
    }
    if (intent === "unassign") {
      await unassignOrder({ shopId: shop.id, shopifyOrderId });
      return { ok: true, message: "Assignment removed" };
    }
    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
  }
};

function money(set: { shopMoney?: { amount?: string } } | null | undefined, currency: string) {
  const amount = set?.shopMoney?.amount;
  return amount ? `${currency} ${Number(amount).toLocaleString("en-IN")}` : "-";
}

export default function OrderDetailsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [noteContent, setNoteContent] = useState("");

  const order = data.order as {
    name?: string;
    createdAt?: string;
    cancelledAt?: string | null;
    email?: string | null;
    phone?: string | null;
    displayFinancialStatus?: string;
    displayFulfillmentStatus?: string;
    currencyCode?: string;
    tags?: string[];
    riskLevel?: string | null;
    customer?: { displayName?: string | null; email?: string | null; phone?: string | null } | null;
    shippingAddress?: { name?: string; address1?: string; address2?: string; city?: string; provinceCode?: string; zip?: string; countryCodeV2?: string; phone?: string } | null;
    subtotalPriceSet?: { shopMoney?: { amount?: string } };
    totalDiscountsSet?: { shopMoney?: { amount?: string } };
    totalShippingPriceSet?: { shopMoney?: { amount?: string } };
    totalTaxSet?: { shopMoney?: { amount?: string } };
    totalPriceSet?: { shopMoney?: { amount?: string } };
    lineItems?: { nodes: Array<{ id: string; title: string; variantTitle?: string | null; quantity: number; originalUnitPriceSet?: { shopMoney?: { amount?: string } }; discountedTotalSet?: { shopMoney?: { amount?: string } } }> };
  } | null;

  const currency = order?.currencyCode ?? "";

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
      {fetcher.data?.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.message}</s-banner>
      ) : null}

      {order ? (
        <s-section heading="Items">
          <s-stack direction="block" gap="base">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Product</s-table-header>
                <s-table-header>Variant</s-table-header>
                <s-table-header format="numeric">Qty</s-table-header>
                <s-table-header format="numeric">Price</s-table-header>
                <s-table-header format="numeric">Total</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {(order.lineItems?.nodes ?? []).map((item) => (
                  <s-table-row key={item.id}>
                    <s-table-cell>{item.title}</s-table-cell>
                    <s-table-cell>{item.variantTitle ?? "-"}</s-table-cell>
                    <s-table-cell>{String(item.quantity)}</s-table-cell>
                    <s-table-cell>{money(item.originalUnitPriceSet, currency)}</s-table-cell>
                    <s-table-cell>{money(item.discountedTotalSet, currency)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
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

      <s-section heading="Internal notes">
        <s-stack direction="block" gap="base">
          {data.notes.length === 0 ? (
            <s-paragraph color="subdued">
              No notes yet. Notes are internal to Order Operations and never change the Shopify order.
            </s-paragraph>
          ) : (
            <s-stack direction="block" gap="base">
              {data.notes.map((note) => (
                <s-stack key={note.id} direction="block" gap="small-500">
                  <s-stack direction="inline" gap="base" justifyContent="space-between">
                    <s-text type="strong">
                      {note.authorName} - {new Date(note.createdAt).toLocaleString("en-IN")}
                    </s-text>
                    <s-button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => fetcher.submit({ intent: "deleteNote", noteId: note.id }, { method: "post" })}
                    >
                      Delete
                    </s-button>
                  </s-stack>
                  <s-paragraph>{note.content}</s-paragraph>
                  <s-divider />
                </s-stack>
              ))}
            </s-stack>
          )}
          <s-text-area
            label="Add a note"
            rows={2}
            placeholder="Write an internal note..."
            value={noteContent}
            onChange={(event) => setNoteContent(event.currentTarget.value)}
          />
          <s-stack direction="inline" justifyContent="end">
            <s-button
              variant="primary"
              disabled={!noteContent.trim()}
              onClick={() => {
                fetcher.submit({ intent: "addNote", content: noteContent }, { method: "post" });
                setNoteContent("");
              }}
            >
              Add note
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

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
              <RiskBadge level={order.riskLevel ?? null} />
            </s-stack>
            {order.cancelledAt ? <s-badge tone="critical">Cancelled</s-badge> : null}
            {order.tags?.length ? (
              <s-stack direction="inline" gap="small-500">
                {order.tags.map((t) => <s-badge key={t} tone="neutral">{t}</s-badge>)}
              </s-stack>
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

      <s-section heading="COD verification">
        <s-stack direction="block" gap="small-200">
          <CodBadge status={data.local?.codStatus ?? "NOT_COD"} />
          <s-select
            label="Change COD status"
            value={data.local?.codStatus ?? "NOT_COD"}
            onChange={(event) =>
              fetcher.submit({ intent: "setCod", codStatus: event.currentTarget.value }, { method: "post" })
            }
          >
            <s-option value="NOT_COD">Not COD</s-option>
            <s-option value="PENDING">Pending</s-option>
            <s-option value="VERIFIED">Verified</s-option>
            <s-option value="FAILED">Failed</s-option>
            <s-option value="CANCELLED">Cancelled</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Assigned staff">
        <s-stack direction="block" gap="small-200">
          <s-paragraph>{data.local?.assignedStaffName ?? "Unassigned"}</s-paragraph>
          <s-select
            label="Assign to"
            value=""
            onChange={(event) => {
              const staffId = event.currentTarget.value;
              if (staffId) fetcher.submit({ intent: "assign", staffId }, { method: "post" });
            }}
          >
            <s-option value="">Choose staff</s-option>
            {data.staff.map((s) => (
              <s-option key={s.id} value={s.id}>{s.name}</s-option>
            ))}
          </s-select>
          {data.local?.assignedStaffId ? (
            <s-stack direction="inline">
              <s-button onClick={() => fetcher.submit({ intent: "unassign" }, { method: "post" })}>
                Unassign
              </s-button>
            </s-stack>
          ) : null}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
