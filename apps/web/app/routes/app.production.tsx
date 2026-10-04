// What still has to be made across the orders matching the current filters,
// grouped by product, variant and personalisation. Read live from Shopify
// with the same filters as the Orders page.

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildProductionSummary, mapAdminOrderToListItem } from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, workflowConfig } from "../services/settings.server";
import { fetchOrdersForExport, orderSearchContext } from "../services/shopify-orders.server";
import { parseOrdersPageParams } from "../lib/params";
import { Customizations } from "../components/Customizations";

export const PRODUCTION_ORDER_LIMIT = 500;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const workflow = workflowConfig(settings);

  const url = new URL(request.url);
  const params = parseOrdersPageParams(url, settings.defaultColumns);
  const context = await orderSearchContext(admin, session.shop, workflow);

  const { orders: nodes, truncated } = await fetchOrdersForExport(admin, {
    filters: params.filters,
    sort: params.sort,
    context: {
      ...context,
      // Cancelled and fully fulfilled orders have nothing left to make, so
      // they should not use up the order limit.
      extraTerms: [
        "-status:cancelled",
        ...(params.filters.fulfillment === "ANY" ? ["-fulfillment_status:fulfilled"] : []),
      ],
    },
    maxOrders: PRODUCTION_ORDER_LIMIT,
  });

  const summary = buildProductionSummary(nodes.map(mapAdminOrderToListItem), {
    showInternal: workflow.showInternalProperties,
  });

  const filterParams = new URLSearchParams(url.searchParams);
  for (const key of ["cursor", "cursorDir", "format"]) filterParams.delete(key);
  const itemsCsvParams = new URLSearchParams(filterParams);
  itemsCsvParams.set("format", "items");

  return {
    summary,
    truncated,
    filterQuery: filterParams.size ? `?${filterParams.toString()}` : "",
    itemsCsvQuery: `?${itemsCsvParams.toString()}`,
  };
};

export default function ProductionSummaryPage() {
  const { summary, truncated, filterQuery, itemsCsvQuery } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Production summary" inlineSize="large">
      <s-link slot="breadcrumb-actions" href={`/app/orders${filterQuery}`}>Orders</s-link>
      <s-button slot="primary-action" variant="primary" onClick={() => window.print()}>
        Print
      </s-button>
      <s-button slot="secondary-actions" href={`/app/orders.csv${itemsCsvQuery}`}>
        Export line items CSV
      </s-button>

      {truncated ? (
        <s-banner tone="warning">
          More than {PRODUCTION_ORDER_LIMIT} orders match, so this summary covers only the first{" "}
          {PRODUCTION_ORDER_LIMIT}. Narrow the filters on the Orders page for a complete total.
        </s-banner>
      ) : null}

      <s-section>
        <s-stack direction="block" gap="small-200">
          <s-heading>
            {summary.totalUnits} unit{summary.totalUnits === 1 ? "" : "s"} to make across{" "}
            {summary.orderCount} order{summary.orderCount === 1 ? "" : "s"}
          </s-heading>
          <s-paragraph color="subdued">
            Unfulfilled items from the orders matching the filters set on the Orders page.
            Identical items are combined; different customizations are listed separately.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section padding="none">
        {summary.rows.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Customizations</s-table-header>
              <s-table-header format="numeric">To make</s-table-header>
              <s-table-header>Orders</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {summary.rows.map((row) => (
                <s-table-row key={row.key}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      {row.imageUrl ? (
                        <s-thumbnail src={row.imageUrl} alt={row.title} size="small" />
                      ) : null}
                      <s-stack direction="block" gap="small-500">
                        <s-text type="strong">{row.title}</s-text>
                        {row.variantTitle ? <s-text color="subdued">{row.variantTitle}</s-text> : null}
                        {row.sku ? <s-text color="subdued">SKU: {row.sku}</s-text> : null}
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {row.customizations.length ? (
                      <Customizations attributes={row.customizations} />
                    ) : (
                      "-"
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text type="strong">{row.quantity}</s-text>
                  </s-table-cell>
                  <s-table-cell>{row.orders.join(", ")}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="large-100">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>Nothing to make</s-heading>
              <s-paragraph color="subdued">
                No unfulfilled items in the orders matching these filters.
              </s-paragraph>
            </s-stack>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
