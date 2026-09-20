import { useCallback, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher, useSearchParams, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  ORDER_COLUMNS,
  mapAdminOrderToListItem,
  type OrderColumnId,
  type BulkActionPayload,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, updateSettings } from "../services/settings.server";
import { fetchOrdersPage } from "../services/shopify-orders.server";
import { listSavedViews, createSavedView } from "../services/views.server";
import { applyBulkAction } from "../services/bulk.server";
import { parseOrdersPageParams, buildOrdersSearch } from "../lib/params";
import { adminOrderUrl } from "../lib/admin-url";
import { FinancialStatusBadge, FulfillmentStatusBadge } from "../components/StatusBadges";
import { ColumnChooser } from "../components/ColumnChooser";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);

  const url = new URL(request.url);
  const params = parseOrdersPageParams(url, settings.defaultColumns);

  const page = await fetchOrdersPage(admin, {
    filters: params.filters,
    sort: params.sort,
    pageSize: settings.rowsPerPage,
    cursor: params.cursor,
    direction: params.direction,
  });

  const views = await listSavedViews(shop.id);
  const orders = page.orders.map(mapAdminOrderToListItem);

  return {
    shopDomain: session.shop,
    orders,
    pageInfo: page.pageInfo,
    searchQuery: page.searchQuery,
    filters: params.filters,
    sort: params.sort,
    columns: params.columns,
    views: views.map((v) => ({ id: v.id, name: v.name, filters: v.filters, sort: v.sort, columns: v.columns })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "columns") {
      const columns = String(formData.get("columns") ?? "")
        .split(",")
        .filter((c) => ORDER_COLUMNS.some((col) => col.id === c));
      await updateSettings(shop.id, { defaultColumns: columns as OrderColumnId[] });
      return { ok: true, message: "Columns saved" };
    }

    if (intent === "saveView") {
      const name = String(formData.get("viewName") ?? "").trim();
      const url = new URL(request.url);
      const params = parseOrdersPageParams(url, settings.defaultColumns);
      await createSavedView({
        shopId: shop.id,
        name,
        filters: params.filters,
        sort: params.sort,
        columns: params.columns,
      });
      return { ok: true, message: "View saved" };
    }

    if (intent === "bulk") {
      const actionPayload = JSON.parse(String(formData.get("bulkAction"))) as BulkActionPayload;
      const shopifyOrderIds = JSON.parse(String(formData.get("orderIds") ?? "[]")) as string[];
      const result = await applyBulkAction({ admin, shopifyOrderIds, action: actionPayload });
      return { ok: true, message: `Bulk action applied to ${result.applied} orders` };
    }

    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  }
};

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type OrderRow = LoaderData["orders"][number];

function money(amount: string | null, currency: string | null): string {
  return amount ? `${currency ?? ""} ${Number(amount).toLocaleString("en-IN")}` : "-";
}

/**
 * The full-width band under each order row: every line item with its image,
 * variant, quantity/SKU and personalisation, so staff never have to open an
 * order to see what has to be made.
 */
function LineItemsBand({ order }: { order: OrderRow }) {
  return (
    <s-stack direction="block" gap="base">
      {order.items.map((item) => (
        <s-grid
          key={item.id}
          gridTemplateColumns="auto minmax(0, 1fr) minmax(0, 1.5fr)"
          gap="base"
          alignItems="start"
        >
          {item.imageUrl ? (
            <s-thumbnail src={item.imageUrl} alt={item.imageAlt ?? item.title} size="large" />
          ) : (
            // Keeps the three columns aligned when an item has no image.
            <s-box inlineSize="60px" blockSize="60px" background="subdued" borderRadius="base" />
          )}
          <s-stack direction="block" gap="small-500">
            <s-text type="strong">{item.title}</s-text>
            {item.variantTitle ? <s-text color="subdued">{item.variantTitle}</s-text> : null}
            <s-text color="subdued">
              x{item.quantity} · SKU: {item.sku ?? "N/A"}
            </s-text>
          </s-stack>
          {item.customAttributes.length ? (
            <s-stack direction="block" gap="small-500">
              <s-text color="subdued">Customizations</s-text>
              <s-stack direction="inline" gap="small-500">
                {item.customAttributes.map((attr) => (
                  <s-chip key={attr.key}>
                    {attr.key}: {attr.value}
                  </s-chip>
                ))}
              </s-stack>
            </s-stack>
          ) : (
            <s-box />
          )}
        </s-grid>
      ))}
      {order.hasMoreItems ? (
        <s-link href={`/app/orders/${encodeURIComponent(order.shopifyOrderId)}`}>
          Show all items
        </s-link>
      ) : null}
    </s-stack>
  );
}

/** Date over time, so the column stays narrow but keeps both. */
function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <>-</>;
  const d = new Date(iso);
  return (
    <s-stack direction="block" gap="small-500">
      <s-text>{d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</s-text>
      <s-text color="subdued">
        {d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
      </s-text>
    </s-stack>
  );
}

function cellFor(column: OrderColumnId, order: OrderRow, shopDomain: string) {
  switch (column) {
    case "name":
      // Opens the real order in the Shopify admin, in a new tab so the queue
      // this page is showing stays put.
      return (
        <s-link href={adminOrderUrl(shopDomain, order.shopifyOrderId)} target="_blank">
          <s-text type="strong">{order.name}</s-text>
        </s-link>
      );
    case "orderedAt":
      return <DateCell iso={order.orderedAt} />;
    case "customerName":
      return order.customerName ? (
        <s-text type="strong">{order.customerName}</s-text>
      ) : "-";
    case "phone":
      return order.phone ?? "-";
    case "email":
      return order.email ?? "-";
    case "financialStatus":
      return <FinancialStatusBadge status={order.financialStatus} />;
    case "fulfillmentStatus":
      return <FulfillmentStatusBadge status={order.fulfillmentStatus} />;
    case "totalPrice":
      return <s-text type="strong">{money(order.totalPrice, order.currency)}</s-text>;
    case "tags":
      return order.tags.length ? (
        <s-stack direction="inline" gap="small-500">{order.tags.slice(0, 3).map((t) => <s-badge key={t} tone="neutral">{t}</s-badge>)}</s-stack>
      ) : "-";
    case "cod":
      return order.cod ? <s-badge tone="warning">COD</s-badge> : "-";
    default:
      return "-";
  }
}

const SORTABLE: OrderColumnId[] = ["name", "orderedAt", "totalPrice"];

// The summary row is a grid rather than a table because each order is
// followed by a band that spans every column, which a table cell cannot do.
const COLUMN_WIDTH: Record<OrderColumnId, string> = {
  name: "minmax(90px, 0.7fr)",
  orderedAt: "minmax(100px, 0.7fr)",
  customerName: "minmax(140px, 1.2fr)",
  phone: "minmax(130px, 1fr)",
  email: "minmax(170px, 1.3fr)",
  totalPrice: "minmax(95px, 0.7fr)",
  financialStatus: "minmax(105px, 0.8fr)",
  fulfillmentStatus: "minmax(115px, 0.9fr)",
  cod: "minmax(70px, 0.5fr)",
  tags: "minmax(120px, 1fr)",
};

const BULK_MODAL = "bulk-action-modal";
const SAVE_VIEW_MODAL = "save-view-modal";

const BULK_TITLES: Record<string, string> = {
  addTag: "Add tag",
  removeTag: "Remove tag",
};

export default function OrdersPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [searchParams] = useSearchParams();

  const [queryValue, setQueryValue] = useState(data.filters.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingBulk, setPendingBulk] = useState<null | string>(null);
  const [tagValue, setTagValue] = useState("");
  const [viewName, setViewName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const navigateWith = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams);
      params.delete("cursor");
      params.delete("cursorDir");
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === "" || value === "ANY") params.delete(key);
        else params.set(key, value);
      }
      const next = params.toString();
      navigate(`/app/orders${next ? `?${next}` : ""}`);
    },
    [navigate, searchParams],
  );

  const onSearchChange = useCallback(
    (value: string) => {
      setQueryValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => navigateWith({ q: value || undefined }), 400);
    },
    [navigateWith],
  );

  const allSelected = data.orders.length > 0 && selectedIds.length === data.orders.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : data.orders.map((o) => o.shopifyOrderId));
  const toggleRow = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );

  const runBulk = (payload: BulkActionPayload) => {
    fetcher.submit(
      {
        intent: "bulk",
        bulkAction: JSON.stringify(payload),
        orderIds: JSON.stringify(selectedIds),
      },
      { method: "post" },
    );
  };

  const confirmBulkModal = () => {
    if (pendingBulk === "addTag") runBulk({ type: "ADD_TAG", tag: tagValue.trim() });
    if (pendingBulk === "removeTag") runBulk({ type: "REMOVE_TAG", tag: tagValue.trim() });
    setPendingBulk(null);
    setTagValue("");
  };

  const appliedFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];
  const f = data.filters;
  if (f.fulfillment !== "ANY") appliedFilters.push({ key: "fulfillment", label: `Fulfillment: ${f.fulfillment.toLowerCase().replace(/_/g, " ")}`, onRemove: () => navigateWith({ fulfillment: undefined }) });
  if (f.financial !== "ANY") appliedFilters.push({ key: "financial", label: `Payment: ${f.financial.toLowerCase()}`, onRemove: () => navigateWith({ financial: undefined }) });
  if (f.tag) appliedFilters.push({ key: "tag", label: `Tag: ${f.tag}`, onRemove: () => navigateWith({ tag: undefined }) });
  if (f.dateRange !== "ANY") appliedFilters.push({ key: "range", label: f.dateRange.replace(/_/g, " ").toLowerCase(), onRemove: () => navigateWith({ range: undefined }) });
  if (f.search) appliedFilters.push({ key: "q", label: `Search: ${f.search}`, onRemove: () => navigateWith({ q: undefined }) });

  const visibleColumns = ORDER_COLUMNS.filter((c) => data.columns.includes(c.id));
  // Leading "auto" is the select checkbox; header and rows share this template
  // so the summary columns line up.
  const gridTemplate = ["auto", ...visibleColumns.map((c) => COLUMN_WIDTH[c.id])].join(" ");

  const sortBy = (columnId: OrderColumnId) => {
    const isCurrent = data.sort.column === columnId;
    navigateWith({
      sort: columnId,
      dir: isCurrent && data.sort.direction === "asc" ? "desc" : "asc",
    });
  };

  const goToPage = (cursor: string | null, direction: "forward" | "backward") => {
    const params = new URLSearchParams(searchParams);
    params.set("cursor", cursor ?? "");
    params.set("cursorDir", direction);
    setSelectedIds([]);
    navigate(`/app/orders?${params.toString()}`);
  };

  return (
    <s-page heading="Orders" inlineSize="large">
      <s-button
        slot="secondary-actions"
        href={`/app/orders.csv${searchParams.size ? `?${searchParams.toString()}` : ""}`}
      >
        Export CSV
      </s-button>
      <s-button slot="secondary-actions" commandFor={SAVE_VIEW_MODAL} command="--show">
        Save current view
      </s-button>

      {fetcher.data?.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.message}</s-banner>
      ) : null}

      <s-section padding="none">
        <s-box padding="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-select
                label="Saved views"
                value=""
                onChange={(event) => {
                  const viewId = event.currentTarget.value;
                  const view = data.views.find((v) => v.id === viewId);
                  if (!view) {
                    navigate("/app/orders");
                    return;
                  }
                  navigate(
                    `/app/orders${buildOrdersSearch(
                      view.filters as unknown as typeof data.filters,
                      (view.sort as never) ?? data.sort,
                      (view.columns as OrderColumnId[])?.length ? (view.columns as OrderColumnId[]) : data.columns,
                    )}`,
                  );
                }}
              >
                <s-option value="">All orders</s-option>
                {data.views.map((v) => (
                  <s-option key={v.id} value={v.id}>{v.name}</s-option>
                ))}
              </s-select>
              <ColumnChooser
                selected={data.columns}
                onApply={(columns) => {
                  fetcher.submit({ intent: "columns", columns: columns.join(",") }, { method: "post" });
                  navigateWith({ cols: columns.join(",") });
                }}
              />
            </s-stack>

            <s-search-field
              label="Search orders"
              placeholder="Search order number, customer, email, phone"
              value={queryValue}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />

            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="small-200">
              <s-select label="Fulfillment" value={f.fulfillment} onChange={(e) => navigateWith({ fulfillment: e.currentTarget.value })}>
                <s-option value="ANY">Any</s-option>
                <s-option value="FULFILLED">Fulfilled</s-option>
                <s-option value="UNFULFILLED">Unfulfilled</s-option>
                <s-option value="PARTIALLY_FULFILLED">Partially fulfilled</s-option>
              </s-select>
              <s-select label="Payment status" value={f.financial} onChange={(e) => navigateWith({ financial: e.currentTarget.value })}>
                <s-option value="ANY">Any</s-option>
                <s-option value="PAID">Paid</s-option>
                <s-option value="PENDING">Pending payment</s-option>
                <s-option value="AUTHORIZED">Authorized</s-option>
                <s-option value="REFUNDED">Refunded</s-option>
              </s-select>
              <s-select label="Date" value={f.dateRange} onChange={(e) => navigateWith({ range: e.currentTarget.value })}>
                <s-option value="ANY">Any time</s-option>
                <s-option value="TODAY">Today</s-option>
                <s-option value="LAST_7_DAYS">Last 7 days</s-option>
                <s-option value="LAST_30_DAYS">Last 30 days</s-option>
              </s-select>
              <s-text-field
                label="Tag"
                placeholder="Filter by tag"
                value={f.tag ?? ""}
                onChange={(e) => navigateWith({ tag: e.currentTarget.value || undefined })}
              />
            </s-grid>

            {appliedFilters.length ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                {appliedFilters.map((af) => (
                  <s-button key={af.key} variant="tertiary" onClick={af.onRemove}>
                    {af.label} &times;
                  </s-button>
                ))}
                <s-button variant="tertiary" tone="critical" onClick={() => navigate("/app/orders")}>Clear all</s-button>
              </s-stack>
            ) : null}

            {selectedIds.length ? (
              <s-box padding="small-200" background="subdued" borderRadius="base">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-text type="strong">{selectedIds.length} selected</s-text>
                  <s-button variant="tertiary" commandFor={BULK_MODAL} command="--show" onClick={() => setPendingBulk("addTag")}>Add tag</s-button>
                  <s-button variant="tertiary" commandFor={BULK_MODAL} command="--show" onClick={() => setPendingBulk("removeTag")}>Remove tag</s-button>
                </s-stack>
              </s-box>
            ) : null}
          </s-stack>
        </s-box>

        {data.orders.length ? (
          <s-box>
            <s-box padding="small-200" background="subdued">
              <s-grid gridTemplateColumns={gridTemplate} gap="small-200" alignItems="center">
                <s-checkbox accessibilityLabel="Select all orders" checked={allSelected} onChange={toggleAll} />
                {visibleColumns.map((c) =>
                  SORTABLE.includes(c.id) ? (
                    <s-clickable key={c.id} onClick={() => sortBy(c.id)}>
                      <s-text type="strong">
                        {c.label}
                        {data.sort.column === c.id ? (data.sort.direction === "asc" ? " ↑" : " ↓") : ""}
                      </s-text>
                    </s-clickable>
                  ) : (
                    <s-text key={c.id} type="strong">{c.label}</s-text>
                  ),
                )}
              </s-grid>
            </s-box>

            {data.orders.map((order) => (
              <s-box key={order.shopifyOrderId}>
                <s-divider />
                <s-box padding="small-200">
                  <s-grid gridTemplateColumns={gridTemplate} gap="small-200" alignItems="center">
                    <s-checkbox
                      accessibilityLabel={`Select ${order.name}`}
                      checked={selectedIds.includes(order.shopifyOrderId)}
                      onChange={() => toggleRow(order.shopifyOrderId)}
                    />
                    {visibleColumns.map((column) => (
                      <s-box key={column.id}>{cellFor(column.id, order, data.shopDomain)}</s-box>
                    ))}
                  </s-grid>
                </s-box>
                {order.items.length ? (
                  <s-box padding="base" background="subdued">
                    <LineItemsBand order={order} />
                  </s-box>
                ) : null}
              </s-box>
            ))}

            <s-divider />
            <s-box padding="base">
              <s-stack direction="inline" gap="small-200" justifyContent="center">
                <s-button
                  disabled={!(data.pageInfo.hasPreviousPage && data.pageInfo.startCursor)}
                  onClick={() => goToPage(data.pageInfo.startCursor, "backward")}
                >
                  Previous
                </s-button>
                <s-button
                  disabled={!(data.pageInfo.hasNextPage && data.pageInfo.endCursor)}
                  onClick={() => goToPage(data.pageInfo.endCursor, "forward")}
                >
                  Next
                </s-button>
              </s-stack>
            </s-box>
          </s-box>
        ) : (
          <s-box padding="large-100">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>
                {data.searchQuery ? "No orders match these filters" : "No orders in this store yet"}
              </s-heading>
              <s-paragraph color="subdued">
                {data.searchQuery
                  ? "Try clearing some filters or search terms."
                  : "Orders appear here as soon as they exist in Shopify - no sync needed."}
              </s-paragraph>
            </s-stack>
          </s-box>
        )}
      </s-section>

      <s-modal id={BULK_MODAL} heading={pendingBulk ? BULK_TITLES[pendingBulk] : "Bulk action"}>
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            {selectedIds.length} order{selectedIds.length === 1 ? "" : "s"} selected
          </s-paragraph>
          <s-text-field label="Tag" value={tagValue} onChange={(e) => setTagValue(e.currentTarget.value)} />
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={!tagValue.trim()}
          commandFor={BULK_MODAL}
          command="--hide"
          onClick={confirmBulkModal}
        >
          Apply
        </s-button>
        <s-button slot="secondary-actions" commandFor={BULK_MODAL} command="--hide" onClick={() => setPendingBulk(null)}>
          Cancel
        </s-button>
      </s-modal>

      <s-modal id={SAVE_VIEW_MODAL} heading="Save current view">
        <s-text-field
          label="View name"
          placeholder="e.g. Today's unfulfilled"
          value={viewName}
          onChange={(e) => setViewName(e.currentTarget.value)}
        />
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={!viewName.trim()}
          commandFor={SAVE_VIEW_MODAL}
          command="--hide"
          onClick={() => {
            fetcher.submit({ intent: "saveView", viewName: viewName.trim() }, { method: "post" });
            setViewName("");
          }}
        >
          Save view
        </s-button>
        <s-button slot="secondary-actions" commandFor={SAVE_VIEW_MODAL} command="--hide">
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
