import { useState } from "react";
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
  Button,
  Select,
  TextField,
  Banner,
  BlockStack,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, updateSettings } from "../services/settings.server";
import { listExportJobs } from "../services/export.server";
import { listSavedViews } from "../services/views.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const [exports, views] = await Promise.all([
    listExportJobs(shop.id),
    listSavedViews(shop.id),
  ]);
  return {
    settings: {
      highValueThreshold: settings.highValueThreshold.toString(),
      defaultSort: settings.defaultSort ?? "orderedAt:desc",
      defaultViewId: settings.defaultViewId ?? "",
      rowsPerPage: settings.rowsPerPage,
      codEnabled: settings.codEnabled,
      defaultCodStatus: settings.defaultCodStatus,
    },
    views: views.map((v) => ({ id: v.id, name: v.name })),
    exports: exports.map((e) => ({
      id: e.id,
      status: e.status,
      rowCount: e.rowCount,
      error: e.error,
      createdAt: e.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  await getOrCreateSettings(shop.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "orderSettings") {
      const threshold = Number(formData.get("highValueThreshold"));
      if (!Number.isFinite(threshold) || threshold < 0) {
        return { ok: false, message: "High-value threshold must be a positive number" };
      }
      await updateSettings(shop.id, {
        highValueThreshold: threshold,
        defaultSort: String(formData.get("defaultSort") ?? "orderedAt:desc"),
        defaultViewId: String(formData.get("defaultViewId") ?? "") || null,
        rowsPerPage: Number(formData.get("rowsPerPage") ?? 50),
      });
      return { ok: true, message: "Order settings saved" };
    }
    if (intent === "codSettings") {
      await updateSettings(shop.id, {
        codEnabled: String(formData.get("codEnabled")) === "true",
        defaultCodStatus: String(formData.get("defaultCodStatus") ?? "PENDING") as never,
      });
      return { ok: true, message: "COD settings saved" };
    }
    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
  }
};

export default function SettingsPage() {
  const { settings, views, exports } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();

  const [threshold, setThreshold] = useState(settings.highValueThreshold);
  const [defaultSort, setDefaultSort] = useState(settings.defaultSort);
  const [defaultViewId, setDefaultViewId] = useState(settings.defaultViewId);
  const [rowsPerPage, setRowsPerPage] = useState(String(settings.rowsPerPage));
  const [codEnabled, setCodEnabled] = useState(settings.codEnabled);
  const [defaultCodStatus, setDefaultCodStatus] = useState(settings.defaultCodStatus);

  return (
    <Page title="Settings">
      <Layout>
        {fetcher.data?.message ? (
          <Layout.Section>
            <Banner tone={fetcher.data.ok ? "success" : "critical"}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Order settings</Text>
                <TextField
                  label="High-value threshold"
                  type="number"
                  autoComplete="off"
                  value={threshold}
                  onChange={setThreshold}
                  helpText="Orders above this total are flagged as high value. Stored as a plain number and displayed with the order currency."
                />
                <InlineStack gap="300">
                  <Select
                    label="Default sorting"
                    options={[
                      { label: "Newest first", value: "orderedAt:desc" },
                      { label: "Oldest first", value: "orderedAt:asc" },
                      { label: "Highest total", value: "totalPrice:desc" },
                      { label: "Lowest total", value: "totalPrice:asc" },
                    ]}
                    value={defaultSort}
                    onChange={setDefaultSort}
                  />
                  <Select
                    label="Default view"
                    options={[{ label: "All orders", value: "" }, ...views.map((v) => ({ label: v.name, value: v.id }))]}
                    value={defaultViewId}
                    onChange={setDefaultViewId}
                  />
                  <TextField
                    label="Rows per page"
                    type="number"
                    autoComplete="off"
                    value={rowsPerPage}
                    onChange={setRowsPerPage}
                  />
                </InlineStack>
                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={() =>
                      fetcher.submit(
                        {
                          intent: "orderSettings",
                          highValueThreshold: threshold,
                          defaultSort,
                          defaultViewId,
                          rowsPerPage,
                        },
                        { method: "post" },
                      )
                    }
                  >
                    Save order settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">COD workflow</Text>
                <Select
                  label="COD workflow"
                  options={[
                    { label: "Enabled", value: "true" },
                    { label: "Disabled", value: "false" },
                  ]}
                  value={String(codEnabled)}
                  onChange={(v) => setCodEnabled(v === "true")}
                />
                <Select
                  label="Default COD status for new COD orders"
                  options={[
                    { label: "Pending", value: "PENDING" },
                    { label: "Verified", value: "VERIFIED" },
                  ]}
                  value={defaultCodStatus}
                  onChange={(v) => setDefaultCodStatus(v as never)}
                />
                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={() =>
                      fetcher.submit(
                        { intent: "codSettings", codEnabled: String(codEnabled), defaultCodStatus },
                        { method: "post" },
                      )
                    }
                  >
                    Save COD settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Table settings</Text>
                <Text as="p" tone="subdued">
                  Default columns are managed from the Orders page with the Columns picker; your selection is saved automatically for this shop.
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Exports</Text>
                {exports.length === 0 ? (
                  <Text as="p" tone="subdued">No exports yet. Use Export CSV on the Orders page.</Text>
                ) : (
                  <BlockStack gap="200">
                    {exports.map((job) => (
                      <InlineStack key={job.id} align="space-between" blockAlign="center">
                        <InlineStack gap="200">
                          <Badge
                            tone={
                              job.status === "COMPLETED" ? "success"
                              : job.status === "FAILED" ? "critical"
                              : "attention"
                            }
                          >
                            {job.status}
                          </Badge>
                          <Text as="span">
                            {new Date(job.createdAt).toLocaleString("en-IN")}
                            {job.rowCount != null ? ` - ${job.rowCount} rows` : ""}
                          </Text>
                        </InlineStack>
                        {job.status === "COMPLETED" ? (
                          <a href={`/app/exports/${job.id}/download`} download>
                            <Button size="slim">Download</Button>
                          </a>
                        ) : job.error ? (
                          <Text as="span" tone="critical">{job.error}</Text>
                        ) : null}
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Billing</Text>
                <Text as="p" tone="subdued">
                  Shopify Managed App Pricing will be attached here. Plans are kept configurable: Free (100 orders/month, basic filters) and Pro (unlimited orders, saved views, bulk actions, staff assignment, COD workflow, CSV exports).
                </Text>
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
