import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate, useRouteError } from "react-router";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Button,
  InlineStack,
  EmptyState,
  Banner,
} from "@shopify/polaris";
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
    <Page title="Saved views">
      <Layout>
        {fetcher.data?.message ? (
          <Layout.Section>
            <Banner tone={fetcher.data.ok ? "success" : "critical"}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        ) : null}
        <Layout.Section>
          <Card padding="0">
            {views.length === 0 ? (
              <EmptyState
                heading="No saved views yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Set filters on the Orders page, then use &quot;Save current view&quot; to keep them here.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "view", plural: "views" }}
                itemCount={views.length}
                selectable={false}
                headings={[{ title: "Name" }, { title: "Created" }, { title: "Actions" }]}
              >
                {views.map((view, index) => (
                  <IndexTable.Row id={view.id} key={view.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{view.name}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {new Date(view.createdAt).toLocaleDateString("en-IN")}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
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
                        </Button>
                        <Button
                          size="slim"
                          onClick={() => fetcher.submit({ intent: "duplicate", viewId: view.id }, { method: "post" })}
                        >
                          Duplicate
                        </Button>
                        <Button
                          size="slim"
                          tone="critical"
                          onClick={() => fetcher.submit({ intent: "delete", viewId: view.id }, { method: "post" })}
                        >
                          Delete
                        </Button>
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
