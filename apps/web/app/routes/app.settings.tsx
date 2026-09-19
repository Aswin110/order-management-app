import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, updateSettings } from "../services/settings.server";
import { listSavedViews } from "../services/views.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const views = await listSavedViews(shop.id);
  return {
    settings: {
      defaultSort: settings.defaultSort ?? "orderedAt:desc",
      defaultViewId: settings.defaultViewId ?? "",
      rowsPerPage: settings.rowsPerPage,
      codEnabled: settings.codEnabled,
      defaultCodStatus: settings.defaultCodStatus,
    },
    views: views.map((v) => ({ id: v.id, name: v.name })),
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
      await updateSettings(shop.id, {
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
  const { settings, views } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();

  const [defaultSort, setDefaultSort] = useState(settings.defaultSort);
  const [defaultViewId, setDefaultViewId] = useState(settings.defaultViewId);
  const [rowsPerPage, setRowsPerPage] = useState(String(settings.rowsPerPage));
  const [codEnabled, setCodEnabled] = useState(settings.codEnabled);
  const [defaultCodStatus, setDefaultCodStatus] = useState(settings.defaultCodStatus);

  return (
    <s-page heading="Settings">
      {fetcher.data?.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.message}</s-banner>
      ) : null}

      <s-section heading="Order settings">
        <s-stack direction="block" gap="base">
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <s-select
              label="Default sorting"
              value={defaultSort}
              onChange={(event) => setDefaultSort(event.currentTarget.value)}
            >
              <s-option value="orderedAt:desc">Newest first</s-option>
              <s-option value="orderedAt:asc">Oldest first</s-option>
              <s-option value="totalPrice:desc">Highest total</s-option>
              <s-option value="totalPrice:asc">Lowest total</s-option>
              <s-option value="name:asc">Order number A-Z</s-option>
              <s-option value="name:desc">Order number Z-A</s-option>
            </s-select>
            <s-select
              label="Default view"
              value={defaultViewId}
              onChange={(event) => setDefaultViewId(event.currentTarget.value)}
            >
              <s-option value="">All orders</s-option>
              {views.map((v) => (
                <s-option key={v.id} value={v.id}>{v.name}</s-option>
              ))}
            </s-select>
            <s-number-field
              label="Rows per page"
              details="10 to 250; each page is one live Shopify query."
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(event.currentTarget.value)}
            />
          </s-grid>
          <s-stack direction="inline">
            <s-button
              variant="primary"
              onClick={() =>
                fetcher.submit(
                  { intent: "orderSettings", defaultSort, defaultViewId, rowsPerPage },
                  { method: "post" },
                )
              }
            >
              Save order settings
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="COD workflow">
        <s-stack direction="block" gap="base">
          <s-select
            label="COD workflow"
            value={String(codEnabled)}
            onChange={(event) => setCodEnabled(event.currentTarget.value === "true")}
          >
            <s-option value="true">Enabled</s-option>
            <s-option value="false">Disabled</s-option>
          </s-select>
          <s-select
            label="Default COD status for new COD orders"
            value={defaultCodStatus}
            onChange={(event) => setDefaultCodStatus(event.currentTarget.value as never)}
          >
            <s-option value="PENDING">Pending</s-option>
            <s-option value="VERIFIED">Verified</s-option>
          </s-select>
          <s-stack direction="inline">
            <s-button
              variant="primary"
              onClick={() =>
                fetcher.submit(
                  { intent: "codSettings", codEnabled: String(codEnabled), defaultCodStatus },
                  { method: "post" },
                )
              }
            >
              Save COD settings
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Table settings">
        <s-paragraph color="subdued">
          Default columns are managed from the Orders page with the Columns picker; your selection is saved automatically for this shop.
        </s-paragraph>
      </s-section>

      <s-section heading="Billing">
        <s-paragraph color="subdued">
          Shopify Managed App Pricing will be attached here.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
