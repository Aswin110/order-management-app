import { useCallback, useRef, useState, type CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher, useSearchParams, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  COD_STATUSES,
  ORDER_COLUMNS,
  WORKFLOW_NONE,
  mapAdminOrderToListItem,
  plainTags,
  slugify,
  visibleAttributes,
  workflowLabel,
  type OrderColumnId,
  type BulkActionPayload,
  type WorkflowGroup,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, updateSettings, workflowConfig } from "../services/settings.server";
import { fetchOrdersPage, orderSearchContext } from "../services/shopify-orders.server";
import { listSavedViews, createSavedView } from "../services/views.server";
import { applyBulkAction } from "../services/bulk.server";
import { parseOrdersPageParams, buildOrdersSearch, normalizeFilters } from "../lib/params";
import { adminOrderUrl } from "../lib/admin-url";
import { useDragReorder } from "../lib/drag-reorder";
import { FinancialStatusBadge, FulfillmentStatusBadge } from "../components/StatusBadges";
import { ColumnChooser } from "../components/ColumnChooser";
import { Customizations } from "../components/Customizations";
import { WorkflowSelect } from "../components/WorkflowSelect";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const workflow = workflowConfig(settings);

  const url = new URL(request.url);
  const params = parseOrdersPageParams(url, settings.defaultColumns);

  const page = await fetchOrdersPage(admin, {
    filters: params.filters,
    sort: params.sort,
    pageSize: settings.rowsPerPage,
    cursor: params.cursor,
    direction: params.direction,
    context: await orderSearchContext(admin, session.shop, workflow),
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
    workflow,
    // Without read_all_orders Shopify only returns orders from the last 60 days.
    recentOrdersOnly: !(session.scope ?? "").split(",").includes("read_all_orders"),
    views: views.map((v) => ({
      id: v.id,
      name: v.name,
      filters: normalizeFilters(v.filters),
      sort: v.sort,
      columns: v.columns,
    })),
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
      return {
        ok: true,
        message: `Updated ${result.applied} order${result.applied === 1 ? "" : "s"}`,
      };
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
function LineItemsBand({ order, showInternal }: { order: OrderRow; showInternal: boolean }) {
  return (
    <s-stack direction="block" gap="base">
      {order.items.map((item) => {
        const customizations = visibleAttributes(item.customAttributes, showInternal);
        return (
        <s-grid
          key={item.id}
          // Item details have a fixed width so customizations start right
          // after them and line up from one order to the next.
          gridTemplateColumns="auto 260px minmax(0, 1fr) auto"
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
            {item.vendor ? <s-text color="subdued">{item.vendor}</s-text> : null}
            <s-text color="subdued">
              x{item.quantity} · SKU: {item.sku ?? "N/A"}
            </s-text>
            <s-stack direction="inline" gap="small-500">
              {/* What is still to be made is the thing a production queue
                  actually needs; a fully fulfilled line is done. */}
              {item.unfulfilledQuantity > 0 ? (
                <s-badge tone="warning">{item.unfulfilledQuantity} to make</s-badge>
              ) : (
                <s-badge tone="success">Fulfilled</s-badge>
              )}
              {item.requiresShipping ? null : <s-badge tone="info">Digital</s-badge>}
            </s-stack>
          </s-stack>
          {customizations.length ? (
            <s-stack direction="block" gap="small-500">
              <s-text color="subdued">Customizations</s-text>
              <Customizations attributes={customizations} />
            </s-stack>
          ) : (
            <s-box />
          )}
          <s-stack direction="block" gap="small-500" alignItems="end">
            <s-text type="strong">{money(item.lineTotal, order.currency)}</s-text>
            {item.quantity > 1 ? (
              <s-text color="subdued">{money(item.unitPrice, order.currency)} each</s-text>
            ) : null}
            {item.lineDiscount ? (
              <s-text tone="success">-{money(item.lineDiscount, order.currency)}</s-text>
            ) : null}
          </s-stack>
        </s-grid>
        );
      })}
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

/** What a cell needs beyond the order itself. */
interface CellContext {
  shopDomain: string;
  workflow: LoaderData["workflow"];
  /** A workflow change is being saved; pickers are disabled until it lands. */
  saving: boolean;
  setWorkflow: (orderId: string, group: WorkflowGroup, value: string | null) => void;
}

function cellFor(column: OrderColumnId, order: OrderRow, ctx: CellContext) {
  switch (column) {
    case "name":
      // Opens the real order in the Shopify admin, in a new tab so the queue
      // this page is showing stays put.
      return (
        <s-stack direction="block" gap="small-500">
          <s-link href={adminOrderUrl(ctx.shopDomain, order.shopifyOrderId)} target="_blank">
            <s-text type="strong">{order.name}</s-text>
          </s-link>
          {order.cancelledAt ? <s-badge tone="critical">Cancelled</s-badge> : null}
          {order.archived ? <s-badge tone="neutral">Archived</s-badge> : null}
        </s-stack>
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
    case "tags": {
      // Workflow tags have their own columns; show only the ordinary ones.
      const tags = plainTags(order.tags);
      return tags.length ? (
        <s-stack direction="inline" gap="small-500">{tags.slice(0, 3).map((t) => <s-badge key={t} tone="neutral">{t}</s-badge>)}</s-stack>
      ) : "-";
    }
    case "stage":
      return (
        <WorkflowSelect
          label={`Stage of ${order.name}`}
          value={order.workflow.stage}
          options={ctx.workflow.stages}
          emptyLabel="No stage"
          disabled={ctx.saving}
          onChange={(value) => ctx.setWorkflow(order.shopifyOrderId, "stage", value)}
        />
      );
    case "assignee":
      return (
        <WorkflowSelect
          label={`${order.name} assigned to`}
          value={order.workflow.assignee}
          options={ctx.workflow.staff}
          emptyLabel="Unassigned"
          disabled={ctx.saving}
          onChange={(value) => ctx.setWorkflow(order.shopifyOrderId, "assignee", value)}
        />
      );
    case "cod":
      return order.cod ? (
        <WorkflowSelect
          label={`COD confirmation for ${order.name}`}
          value={order.workflow.cod}
          options={COD_STATUSES.map((s) => s.label)}
          emptyLabel="COD: unconfirmed"
          prefix="COD: "
          disabled={ctx.saving}
          onChange={(value) => ctx.setWorkflow(order.shopifyOrderId, "cod", value)}
        />
      ) : "-";
    case "itemCount":
      return <s-text>{order.itemCount}</s-text>;
    case "note":
      // Order notes run long; the detail page has the untruncated text.
      return order.note ? (
        <s-text color="subdued">
          {order.note.length > 120 ? `${order.note.slice(0, 120)}…` : order.note}
        </s-text>
      ) : "-";
    case "shipTo":
      return order.shipTo ?? "-";
    case "paymentMethod":
      return order.paymentMethod ?? "-";
    case "deliveryMethod":
      return order.deliveryMethod ?? "-";
    default:
      return "-";
  }
}

const SORTABLE: OrderColumnId[] = ["name", "orderedAt", "totalPrice"];

// The list is one CSS grid shared by the header and every order row (each
// row is a subgrid), so a column is exactly as wide as its widest cell and
// columns sit close together instead of being stretched across the page. It
// is a grid rather than a table because each order is followed by a band
// that spans every column, which a table cell cannot do.
//
// Text columns are capped so a long value wraps instead of pushing the rest
// off screen. The cap is on the cell, not the grid track, so a column never
// shrinks below its content when the list is wider than the page - the list
// scrolls sideways instead.
const COLUMN_MAX_WIDTH: Partial<Record<OrderColumnId, number>> = {
  customerName: 200,
  email: 240,
  tags: 220,
  note: 280,
  shipTo: 200,
  paymentMethod: 200,
  deliveryMethod: 160,
};

// Pickers have no natural width, so their columns are fixed.
const PICKER_WIDTH: Partial<Record<OrderColumnId, number>> = {
  stage: 150,
  assignee: 150,
  cod: 170,
};

const columnTrack = (id: OrderColumnId) =>
  PICKER_WIDTH[id] ? `${PICKER_WIDTH[id]}px` : "max-content";

// A header or order row: takes its columns from the list grid.
const ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "subgrid",
  gridColumn: "1 / -1",
  alignItems: "center",
  padding: "8px 12px",
};

const FULL_WIDTH: CSSProperties = { gridColumn: "1 / -1" };

const BULK_MODAL = "bulk-action-modal";
const SAVE_VIEW_MODAL = "save-view-modal";

const BULK_TITLES: Record<string, string> = {
  addTag: "Add tag",
  removeTag: "Remove tag",
};

// Value of the "clear" option in the bulk stage / assignee pickers.
const BULK_CLEAR = "__clear__";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  CLOSED: "Archived",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABELS: Record<string, string> = {
  COD: "Cash on delivery",
  PREPAID: "Prepaid",
};

const DELIVERY_LABELS: Record<string, string> = {
  SHIPPING: "Shipping",
  LOCAL: "Local delivery",
  PICK_UP: "Pickup in store",
  PICKUP_POINT: "Pickup point",
  RETAIL: "Retail",
  NONE: "No delivery",
};

export default function OrdersPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  // One-click workflow changes on a row get their own fetcher so they do not
  // replace the banner from a bulk action, and report only failures.
  const workflowFetcher = useFetcher<{ ok: boolean; message: string }>();
  const [searchParams] = useSearchParams();

  const [queryValue, setQueryValue] = useState(data.filters.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingBulk, setPendingBulk] = useState<null | string>(null);
  const [tagValue, setTagValue] = useState("");
  const [viewName, setViewName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Bumped after a bulk stage/assignee pick so those pickers reset to their prompt.
  const [bulkPickerKey, setBulkPickerKey] = useState(0);

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

  const setWorkflow = (orderId: string, group: WorkflowGroup, value: string | null) => {
    const payload: BulkActionPayload = { type: "SET_WORKFLOW", group, value };
    workflowFetcher.submit(
      { intent: "bulk", bulkAction: JSON.stringify(payload), orderIds: JSON.stringify([orderId]) },
      { method: "post" },
    );
  };

  const bulkSetWorkflow = (group: WorkflowGroup, picked: string) => {
    if (!picked) return;
    runBulk({ type: "SET_WORKFLOW", group, value: picked === BULK_CLEAR ? null : picked });
    setBulkPickerKey((k) => k + 1);
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
  if (f.status !== "ANY") appliedFilters.push({ key: "status", label: `Status: ${STATUS_LABELS[f.status]?.toLowerCase()}`, onRemove: () => navigateWith({ status: undefined }) });
  if (f.payment !== "ANY") appliedFilters.push({ key: "payment", label: `Payment method: ${PAYMENT_LABELS[f.payment]?.toLowerCase()}`, onRemove: () => navigateWith({ payment: undefined }) });
  if (f.delivery !== "ANY") appliedFilters.push({ key: "delivery", label: `Delivery: ${DELIVERY_LABELS[f.delivery]?.toLowerCase()}`, onRemove: () => navigateWith({ delivery: undefined }) });
  if (f.stage) appliedFilters.push({ key: "stage", label: f.stage === WORKFLOW_NONE ? "No stage" : `Stage: ${workflowLabel(f.stage, data.workflow.stages)}`, onRemove: () => navigateWith({ stage: undefined }) });
  if (f.assignee) appliedFilters.push({ key: "assignee", label: f.assignee === WORKFLOW_NONE ? "Unassigned" : `Assigned to: ${workflowLabel(f.assignee, data.workflow.staff)}`, onRemove: () => navigateWith({ assignee: undefined }) });
  if (f.tag) appliedFilters.push({ key: "tag", label: `Tag: ${f.tag}`, onRemove: () => navigateWith({ tag: undefined }) });
  if (f.tagNot) appliedFilters.push({ key: "notTag", label: `Without tag: ${f.tagNot}`, onRemove: () => navigateWith({ notTag: undefined }) });
  if (f.sku) appliedFilters.push({ key: "sku", label: `SKU: ${f.sku}`, onRemove: () => navigateWith({ sku: undefined }) });
  if (f.dateRange === "CUSTOM") {
    if (f.dateFrom || f.dateTo) appliedFilters.push({ key: "range", label: `${f.dateFrom ?? "…"} to ${f.dateTo ?? "…"}`, onRemove: () => navigateWith({ range: undefined, from: undefined, to: undefined }) });
  } else if (f.dateRange !== "ANY") {
    appliedFilters.push({ key: "range", label: f.dateRange.replace(/_/g, " ").toLowerCase(), onRemove: () => navigateWith({ range: undefined }) });
  }
  if (f.search) appliedFilters.push({ key: "q", label: `Search: ${f.search}`, onRemove: () => navigateWith({ q: undefined }) });

  // Columns show in the order the shop arranged them.
  const visibleColumns = data.columns
    .map((id) => ORDER_COLUMNS.find((c) => c.id === id))
    .filter((c): c is (typeof ORDER_COLUMNS)[number] => Boolean(c));
  const listStyle: CSSProperties = {
    display: "grid",
    // Select checkbox, the columns, then a spacer that takes any spare width
    // so the columns stay packed to the left.
    gridTemplateColumns: ["auto", ...visibleColumns.map((c) => columnTrack(c.id)), "1fr"].join(" "),
    columnGap: "16px",
  };

  // Saves the arrangement for the shop and shows it straight away.
  const applyColumns = (columns: OrderColumnId[]) => {
    fetcher.submit({ intent: "columns", columns: columns.join(",") }, { method: "post" });
    navigateWith({ cols: columns.join(",") });
  };
  // Dragging a column header onto another moves the column there.
  const headerDrag = useDragReorder(
    visibleColumns.map((c) => c.id),
    applyColumns,
    "horizontal",
  );

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

  // The same filters drive the exports and the production summary; the page
  // cursor does not apply to them.
  const filterParams = new URLSearchParams(searchParams);
  filterParams.delete("cursor");
  filterParams.delete("cursorDir");
  const filterQuery = filterParams.size ? `?${filterParams.toString()}` : "";
  const itemsCsvParams = new URLSearchParams(filterParams);
  itemsCsvParams.set("format", "items");

  const printHref = (type: "jobsheet" | "packing" | "list") =>
    `/app/print?type=${type}&ids=${selectedIds.map(encodeURIComponent).join(",")}`;

  const cellContext: CellContext = {
    shopDomain: data.shopDomain,
    workflow: data.workflow,
    saving: workflowFetcher.state !== "idle",
    setWorkflow,
  };

  return (
    <s-page heading="Orders" inlineSize="large">
      <s-button slot="secondary-actions" href={`/app/production${filterQuery}`}>
        Production summary
      </s-button>
      <s-button slot="secondary-actions" href={`/app/orders.csv${filterQuery}`}>
        Export orders CSV
      </s-button>
      <s-button slot="secondary-actions" href={`/app/orders.csv?${itemsCsvParams.toString()}`}>
        Export line items CSV
      </s-button>
      <s-button slot="secondary-actions" commandFor={SAVE_VIEW_MODAL} command="--show">
        Save current view
      </s-button>

      {fetcher.data?.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.message}</s-banner>
      ) : null}
      {workflowFetcher.data && !workflowFetcher.data.ok ? (
        <s-banner tone="critical">{workflowFetcher.data.message}</s-banner>
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
                      view.filters,
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
              <ColumnChooser selected={data.columns} onApply={applyColumns} />
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
              <s-select label="Order status" value={f.status} onChange={(e) => navigateWith({ status: e.currentTarget.value })}>
                <s-option value="ANY">Any</s-option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <s-option key={value} value={value}>{label}</s-option>
                ))}
              </s-select>
              <s-select label="Payment method" value={f.payment} onChange={(e) => navigateWith({ payment: e.currentTarget.value })}>
                <s-option value="ANY">Any</s-option>
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <s-option key={value} value={value}>{label}</s-option>
                ))}
              </s-select>
              <s-select label="Delivery" value={f.delivery} onChange={(e) => navigateWith({ delivery: e.currentTarget.value })}>
                <s-option value="ANY">Any</s-option>
                {Object.entries(DELIVERY_LABELS).map(([value, label]) => (
                  <s-option key={value} value={value}>{label}</s-option>
                ))}
              </s-select>
              <s-select label="Stage" value={f.stage ?? ""} onChange={(e) => navigateWith({ stage: e.currentTarget.value })}>
                <s-option value="">Any</s-option>
                <s-option value={WORKFLOW_NONE}>No stage</s-option>
                {data.workflow.stages.map((label) => (
                  <s-option key={label} value={slugify(label)}>{label}</s-option>
                ))}
              </s-select>
              {data.workflow.staff.length ? (
                <s-select label="Assigned to" value={f.assignee ?? ""} onChange={(e) => navigateWith({ assignee: e.currentTarget.value })}>
                  <s-option value="">Anyone</s-option>
                  <s-option value={WORKFLOW_NONE}>Unassigned</s-option>
                  {data.workflow.staff.map((label) => (
                    <s-option key={label} value={slugify(label)}>{label}</s-option>
                  ))}
                </s-select>
              ) : null}
              <s-select
                label="Date"
                value={f.dateRange}
                onChange={(e) => {
                  const range = e.currentTarget.value;
                  // Preset ranges have no use for the custom bounds.
                  navigateWith(range === "CUSTOM" ? { range } : { range, from: undefined, to: undefined });
                }}
              >
                <s-option value="ANY">Any time</s-option>
                <s-option value="TODAY">Today</s-option>
                <s-option value="LAST_7_DAYS">Last 7 days</s-option>
                <s-option value="LAST_30_DAYS">Last 30 days</s-option>
                <s-option value="CUSTOM">Custom range</s-option>
              </s-select>
              {f.dateRange === "CUSTOM" ? (
                <>
                  <s-date-field label="From" value={f.dateFrom ?? ""} onChange={(e) => navigateWith({ from: e.currentTarget.value || undefined })} />
                  <s-date-field label="To" value={f.dateTo ?? ""} onChange={(e) => navigateWith({ to: e.currentTarget.value || undefined })} />
                </>
              ) : null}
              <s-text-field
                label="Tag"
                placeholder="Filter by tag"
                value={f.tag ?? ""}
                onChange={(e) => navigateWith({ tag: e.currentTarget.value || undefined })}
              />
              <s-text-field
                label="Without tag"
                placeholder="Exclude a tag"
                value={f.tagNot ?? ""}
                onChange={(e) => navigateWith({ notTag: e.currentTarget.value || undefined })}
              />
              <s-text-field
                label="SKU"
                placeholder="Exact SKU"
                value={f.sku ?? ""}
                onChange={(e) => navigateWith({ sku: e.currentTarget.value || undefined })}
              />
            </s-grid>

            {data.recentOrdersOnly ? (
              <s-text color="subdued">
                Showing orders from the last 60 days. Older orders appear once the app is granted access to all orders.
              </s-text>
            ) : null}

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
                  <s-select
                    key={`stage-${bulkPickerKey}`}
                    label="Set stage for selected orders"
                    labelAccessibilityVisibility="exclusive"
                    value=""
                    onChange={(e) => bulkSetWorkflow("stage", e.currentTarget.value)}
                  >
                    <s-option value="">Set stage…</s-option>
                    {data.workflow.stages.map((label) => (
                      <s-option key={label} value={slugify(label)}>{label}</s-option>
                    ))}
                    <s-option value={BULK_CLEAR}>Clear stage</s-option>
                  </s-select>
                  {data.workflow.staff.length ? (
                    <s-select
                      key={`assignee-${bulkPickerKey}`}
                      label="Assign selected orders"
                      labelAccessibilityVisibility="exclusive"
                      value=""
                      onChange={(e) => bulkSetWorkflow("assignee", e.currentTarget.value)}
                    >
                      <s-option value="">Assign to…</s-option>
                      {data.workflow.staff.map((label) => (
                        <s-option key={label} value={slugify(label)}>{label}</s-option>
                      ))}
                      <s-option value={BULK_CLEAR}>Unassign</s-option>
                    </s-select>
                  ) : null}
                  <s-button variant="tertiary" href={printHref("jobsheet")}>Print job sheets</s-button>
                  <s-button variant="tertiary" href={printHref("packing")}>Print packing slips</s-button>
                  <s-button variant="tertiary" href={printHref("list")}>Print list</s-button>
                </s-stack>
              </s-box>
            ) : null}
          </s-stack>
        </s-box>

        {data.orders.length ? (
          <s-box>
            {/* Scrolls sideways when the columns are wider than the page.
                Positioned so absolutely placed parts of the pickers (their
                hidden labels) scroll with it instead of widening the page. */}
            <div style={{ overflowX: "auto", position: "relative" }}>
              <div style={listStyle}>
                {/* The header's background: a Polaris surface stretched under the header row. */}
                <div style={{ ...FULL_WIDTH, gridRow: 1, display: "grid" }}>
                  <s-box background="subdued" />
                </div>
                <div style={{ ...ROW_STYLE, gridRow: 1 }}>
                  <s-checkbox accessibilityLabel="Select all orders" checked={allSelected} onChange={toggleAll} />
                  {visibleColumns.map((c) => (
                    <div key={c.id} title="Drag to move this column" {...headerDrag.itemProps(c.id)}>
                      {SORTABLE.includes(c.id) ? (
                        <s-clickable onClick={() => sortBy(c.id)}>
                          <s-text type="strong">
                            {c.label}
                            {data.sort.column === c.id ? (data.sort.direction === "asc" ? " ↑" : " ↓") : ""}
                          </s-text>
                        </s-clickable>
                      ) : (
                        <s-text type="strong">{c.label}</s-text>
                      )}
                    </div>
                  ))}
                </div>

                {data.orders.map((order) => (
                  <div key={order.shopifyOrderId} style={{ ...FULL_WIDTH, display: "grid", gridTemplateColumns: "subgrid" }}>
                    <div style={FULL_WIDTH}>
                      <s-divider />
                    </div>
                    <div style={ROW_STYLE}>
                      <s-checkbox
                        accessibilityLabel={`Select ${order.name}`}
                        checked={selectedIds.includes(order.shopifyOrderId)}
                        onChange={() => toggleRow(order.shopifyOrderId)}
                      />
                      {visibleColumns.map((column) => (
                        <div key={column.id} style={{ maxWidth: COLUMN_MAX_WIDTH[column.id] }}>
                          {cellFor(column.id, order, cellContext)}
                        </div>
                      ))}
                    </div>
                    {order.items.length ? (
                      <div style={FULL_WIDTH}>
                        <s-box padding="base" background="subdued">
                          <LineItemsBand order={order} showInternal={data.workflow.showInternalProperties} />
                        </s-box>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

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
