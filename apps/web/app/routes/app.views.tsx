import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import {
  listSavedViews,
  deleteSavedView,
  duplicateSavedView,
} from "../services/views.server";
import { buildOrdersSearch } from "../lib/params";
import type { OrderFilters, OrderSort, OrderColumnId } from "@order-operations/shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const views = await listSavedViews(shop.id);
  return {
    views: views.map((v) => ({
      id: v.id,
      name: v.name,
      filters: v.filters,
      sort: v.sort,
      columns: v.columns,
      createdAt: v.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const viewId = String(formData.get("viewId") ?? "");

  try {
    if (intent === "delete") {
      await deleteSavedView(shop.id, viewId);
      return { ok: true, message: "View deleted" };
    }
    if (intent === "duplicate") {
      await duplicateSavedView(shop.id, viewId);
      return { ok: true, message: "View duplicated" };
    }
    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
  }
};

export default function SavedViewsPage() {
  const { views } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const navigate = useNavigate();

  return (
    <s-page heading="Saved views">
      {fetcher.data?.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>
          {fetcher.data.message}
        </s-banner>
      ) : null}
      <s-section padding="none">
        {views.length === 0 ? (
          <s-box padding="large-100">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>No saved views yet</s-heading>
              <s-paragraph color="subdued">
                Set filters on the Orders page, then use &quot;Save current view&quot; to keep them here.
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header>Created</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {views.map((view) => (
                <s-table-row key={view.id}>
                  <s-table-cell>
                    <s-text type="strong">{view.name}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {new Date(view.createdAt).toLocaleDateString("en-IN")}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        variant="secondary"
                        onClick={() =>
                          navigate(
                            `/app/orders${buildOrdersSearch(
                              view.filters as unknown as OrderFilters,
                              (view.sort as unknown as OrderSort) ?? { column: "orderedAt", direction: "desc" },
                              (view.columns as OrderColumnId[]).length ? (view.columns as OrderColumnId[]) : undefined,
                            )}`,
                          )
                        }
                      >
                        Open
                      </s-button>
                      <s-button
                        variant="secondary"
                        onClick={() => fetcher.submit({ intent: "duplicate", viewId: view.id }, { method: "post" })}
                      >
                        Duplicate
                      </s-button>
                      <s-button
                        variant="secondary"
                        tone="critical"
                        onClick={() => fetcher.submit({ intent: "delete", viewId: view.id }, { method: "post" })}
                      >
                        Delete
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
