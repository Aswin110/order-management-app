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
import { getOrCreateSettings, updateSettings, workflowConfig } from "../services/settings.server";
import { listSavedViews } from "../services/views.server";
import {
  PLAN_PRICE_LABEL,
  billingEnforced,
  hasActiveSubscription,
  planSelectionUrl,
} from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const views = await listSavedViews(shop.id);
  const workflow = workflowConfig(settings);
  const enforced = billingEnforced();
  return {
    settings: {
      defaultSort: settings.defaultSort ?? "orderedAt:desc",
      defaultViewId: settings.defaultViewId ?? "",
      rowsPerPage: settings.rowsPerPage,
    },
    workflow,
    views: views.map((v) => ({ id: v.id, name: v.name })),
    billing: {
      enforced,
      // If the Partner API is unreachable the status is unknown, not inactive.
      active: enforced ? await hasActiveSubscription(admin, session.shop).catch(() => null) : null,
      priceLabel: PLAN_PRICE_LABEL,
      planUrl: planSelectionUrl(session.shop),
    },
  };
};

/** One label per line, as typed into a settings text area. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "").split(/\r?\n/);
}

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
    if (intent === "workflowSettings") {
      await updateSettings(shop.id, {
        workflowStages: lines(formData.get("stages")),
        staffNames: lines(formData.get("staff")),
        showInternalProperties: formData.get("showInternalProperties") === "true",
      });
      return { ok: true, message: "Workflow settings saved" };
    }
    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
  }
};

export default function SettingsPage() {
  const { settings, views, workflow, billing } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();

  const [defaultSort, setDefaultSort] = useState(settings.defaultSort);
  const [defaultViewId, setDefaultViewId] = useState(settings.defaultViewId);
  const [rowsPerPage, setRowsPerPage] = useState(String(settings.rowsPerPage));
  const [stages, setStages] = useState(workflow.stages.join("\n"));
  const [staff, setStaff] = useState(workflow.staff.join("\n"));
  const [showInternalProperties, setShowInternalProperties] = useState(
    workflow.showInternalProperties,
  );

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

      <s-section heading="Workflow">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Stage, assignee and COD confirmation are saved on each order as Shopify tags
            (for example &quot;stage:in-production&quot;), so they also show in the Shopify admin.
            Renaming a stage or person does not change orders already tagged with the old name.
          </s-paragraph>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
            <s-text-area
              label="Stages"
              details="One per line, in the order work moves through them."
              rows={5}
              value={stages}
              onChange={(event) => setStages(event.currentTarget.value)}
            />
            <s-text-area
              label="Team members"
              details="One per line. Orders can be assigned to these people."
              rows={5}
              value={staff}
              onChange={(event) => setStaff(event.currentTarget.value)}
            />
          </s-grid>
          <s-switch
            label="Show internal line item properties"
            details="Properties whose name starts with an underscore are added by apps and themes and are hidden by default."
            checked={showInternalProperties}
            onChange={(event) => setShowInternalProperties(event.currentTarget.checked)}
          />
          <s-stack direction="inline">
            <s-button
              variant="primary"
              onClick={() =>
                fetcher.submit(
                  {
                    intent: "workflowSettings",
                    stages,
                    staff,
                    showInternalProperties: String(showInternalProperties),
                  },
                  { method: "post" },
                )
              }
            >
              Save workflow settings
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
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text>Order Operations costs {billing.priceLabel}, billed through Shopify.</s-text>
            {billing.active === true ? <s-badge tone="success">Active</s-badge> : null}
            {billing.active === false ? <s-badge tone="warning">No active plan</s-badge> : null}
          </s-stack>
          {billing.enforced ? (
            <s-stack direction="inline">
              <s-button href={billing.planUrl} target="_top">
                {billing.active ? "Manage plan" : "Choose plan"}
              </s-button>
            </s-stack>
          ) : (
            <s-paragraph color="subdued">
              Billing is not switched on for this installation, so the app is free to use here.
            </s-paragraph>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
