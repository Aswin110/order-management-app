import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Select,
  TextField,
  Divider,
  Banner,
  DataTable,
} from "@shopify/polaris";
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

  return (
    <Page
      backAction={{ url: "/app/orders" }}
      title={order?.name ?? "Order"}
      subtitle={order?.createdAt ? `Placed ${new Date(order.createdAt).toLocaleString("en-IN")}` : undefined}
      primaryAction={{
        content: "Open in Shopify Admin",
        onAction: () => window.open(adminOrderUrl(data.shopDomain, data.shopifyOrderId), "_blank"),
      }}
    >
      <Layout>
        {data.fetchError ? (
          <Layout.Section>
            <Banner tone="warning">
              <p>Live order data could not be loaded from Shopify: {data.fetchError}</p>
            </Banner>
          </Layout.Section>
        ) : null}
        {fetcher.data?.message ? (
          <Layout.Section>
            <Banner tone={fetcher.data.ok ? "success" : "critical"}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <BlockStack gap="400">
            {order ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Items</Text>
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "numeric", "numeric"]}
                    headings={["Product", "Variant", "Qty", "Price", "Total"]}
                    rows={(order.lineItems?.nodes ?? []).map((item) => [
                      item.title,
                      item.variantTitle ?? "-",
                      item.quantity,
                      money(item.originalUnitPriceSet, currency),
                      money(item.discountedTotalSet, currency),
                    ])}
                  />
                  <Divider />
                  <BlockStack gap="100">
                    <InlineStack align="space-between"><Text as="span" tone="subdued">Subtotal</Text><Text as="span">{money(order.subtotalPriceSet, currency)}</Text></InlineStack>
                    <InlineStack align="space-between"><Text as="span" tone="subdued">Discounts</Text><Text as="span">-{money(order.totalDiscountsSet, currency)}</Text></InlineStack>
                    <InlineStack align="space-between"><Text as="span" tone="subdued">Shipping</Text><Text as="span">{money(order.totalShippingPriceSet, currency)}</Text></InlineStack>
                    <InlineStack align="space-between"><Text as="span" tone="subdued">Tax</Text><Text as="span">{money(order.totalTaxSet, currency)}</Text></InlineStack>
                    <InlineStack align="space-between"><Text as="span" variant="headingSm">Total</Text><Text as="span" variant="headingSm">{money(order.totalPriceSet, currency)}</Text></InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Internal notes</Text>
                {data.notes.length === 0 ? (
                  <Text as="p" tone="subdued">No notes yet. Notes are internal to Order Operations and never change the Shopify order.</Text>
                ) : (
                  <BlockStack gap="300">
                    {data.notes.map((note) => (
                      <BlockStack gap="100" key={note.id}>
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {note.authorName} - {new Date(note.createdAt).toLocaleString("en-IN")}
                          </Text>
                          <Button
                            size="micro"
                            tone="critical"
                            variant="plain"
                            onClick={() => fetcher.submit({ intent: "deleteNote", noteId: note.id }, { method: "post" })}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                        <Text as="p">{note.content}</Text>
                        <Divider />
                      </BlockStack>
                    ))}
                  </BlockStack>
                )}
                <InlineStack gap="200" align="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Add a note"
                      labelHidden
                      autoComplete="off"
                      multiline={2}
                      value={noteContent}
                      onChange={setNoteContent}
                      placeholder="Write an internal note..."
                    />
                  </div>
                  <Button
                    variant="primary"
                    disabled={!noteContent.trim()}
                    onClick={() => {
                      fetcher.submit({ intent: "addNote", content: noteContent }, { method: "post" });
                      setNoteContent("");
                    }}
                  >
                    Add note
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {order ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Customer</Text>
                  <Text as="p">{order.customer?.displayName ?? "Guest"}</Text>
                  {order.customer?.email || order.email ? <Text as="p" tone="subdued">{order.customer?.email ?? order.email}</Text> : null}
                  {order.customer?.phone || order.phone ? <Text as="p" tone="subdued">{order.customer?.phone ?? order.phone}</Text> : null}
                  <Divider />
                  <InlineStack gap="200">
                    <FinancialStatusBadge status={order.displayFinancialStatus ?? null} />
                    <FulfillmentStatusBadge status={order.displayFulfillmentStatus ?? null} />
                    <RiskBadge level={order.riskLevel ?? null} />
                  </InlineStack>
                  {order.cancelledAt ? <Badge tone="critical">Cancelled</Badge> : null}
                  {order.tags?.length ? (
                    <InlineStack gap="100">{order.tags.map((t) => <Badge key={t}>{t}</Badge>)}</InlineStack>
                  ) : null}
                </BlockStack>
              </Card>
            ) : null}

            {order?.shippingAddress ? (
              <Card>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Shipping address</Text>
                  <Text as="p">{order.shippingAddress.name}</Text>
                  <Text as="p" tone="subdued">
                    {[order.shippingAddress.address1, order.shippingAddress.address2, order.shippingAddress.city, order.shippingAddress.provinceCode, order.shippingAddress.zip, order.shippingAddress.countryCodeV2].filter(Boolean).join(", ")}
                  </Text>
                  {order.shippingAddress.phone ? <Text as="p" tone="subdued">{order.shippingAddress.phone}</Text> : null}
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">COD verification</Text>
                <CodBadge status={data.local?.codStatus ?? "NOT_COD"} />
                <Select
                  label="Change COD status"
                  options={[
                    { label: "Not COD", value: "NOT_COD" },
                    { label: "Pending", value: "PENDING" },
                    { label: "Verified", value: "VERIFIED" },
                    { label: "Failed", value: "FAILED" },
                    { label: "Cancelled", value: "CANCELLED" },
                  ]}
                  value={data.local?.codStatus ?? "NOT_COD"}
                  onChange={(value) => fetcher.submit({ intent: "setCod", codStatus: value }, { method: "post" })}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Assigned staff</Text>
                <Text as="p">{data.local?.assignedStaffName ?? "Unassigned"}</Text>
                <Select
                  label="Assign to"
                  options={[{ label: "Choose staff", value: "" }, ...data.staff.map((s) => ({ label: s.name, value: s.id }))]}
                  value=""
                  onChange={(value) => {
                    if (value) fetcher.submit({ intent: "assign", staffId: value }, { method: "post" });
                  }}
                />
                {data.local?.assignedStaffId ? (
                  <Button onClick={() => fetcher.submit({ intent: "unassign" }, { method: "post" })}>
                    Unassign
                  </Button>
                ) : null}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
