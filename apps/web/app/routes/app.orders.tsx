import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher, useSearchParams, useRouteError } from "react-router";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Filters,
  ChoiceList,
  Pagination,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Modal,
  TextField,
  Select,
  EmptyState,
  Banner,
  useIndexResourceState,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  ORDER_COLUMNS,
  type OrderColumnId,
  type BulkActionPayload,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, updateSettings } from "../services/settings.server";
import { queryOrders } from "../services/orders/query.server";
import { getDashboardMetrics } from "../services/metrics.server";
import { listStaff } from "../services/staff.server";
import { listSavedViews, createSavedView } from "../services/views.server";
import { enqueueOrderSync } from "../services/queues.server";
import { requestCsvExport } from "../services/export.server";
import { applyBulkAction } from "../services/bulk.server";
import { parseOrdersPageParams, buildOrdersSearch } from "../lib/params";
import { adminOrderUrl } from "../lib/admin-url";
import { SummaryCards } from "../components/SummaryCards";
import { CodBadge } from "../components/CodBadge";
import { FinancialStatusBadge, FulfillmentStatusBadge, RiskBadge } from "../components/StatusBadges";
import { ColumnChooser } from "../components/ColumnChooser";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);

  const url = new URL(request.url);
  const params = parseOrdersPageParams(url, settings.defaultColumns);

  const page = await queryOrders({
    shopId: shop.id,
    filters: params.filters,
    sort: params.sort,
    highValueThreshold: settings.highValueThreshold,
    cursor: params.cursor,
    direction: params.direction,
    pageSize: settings.rowsPerPage,
  });

  const [metrics, staff, views] = await Promise.all([
    getDashboardMetrics(shop.id, settings.highValueThreshold),
    listStaff(shop.id),
    listSavedViews(shop.id),
  ]);

  const orders = page.orders.map((o) => ({
    id: o.id,
    shopifyOrderId: o.shopifyOrderId,
    name: o.name,
    orderedAt: o.orderedAt.toISOString(),
    customerName: o.customerName,
    email: o.email,
    phone: o.phone,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    totalPrice: o.totalPrice?.toString() ?? null,
    currency: o.currency,
    itemCount: o.itemCount,
    tags: o.tags,
    latestNote: o.latestNote,
    notesCount: o.notesCount,
    codStatus: o.codStatus,
    assignedStaffId: o.assignedStaffId,
    assignedStaffName: o.assignedStaff?.name ?? null,
    riskLevel: o.riskLevel,
    shippingAddress: o.shippingAddress,
    deliveryDate: o.deliveryDate?.toISOString() ?? null,
  }));

  return {
    shopDomain: session.shop,
    orders,
    nextCursor: page.nextCursor,
    previousCursor: page.previousCursor,
    totalCount: page.totalCount,
    metrics: { ...metrics, currency: orders[0]?.currency ?? "INR" },
    filters: params.filters,
    sort: params.sort,
    columns: params.columns,
    highValueThreshold: settings.highValueThreshold.toString(),
    staff: staff.map((s) => ({ id: s.id, name: s.name })),
    views: views.map((v) => ({ id: v.id, name: v.name, filters: v.filters, sort: v.sort, columns: v.columns })),
    hasOrders: page.totalCount > 0,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getOrCreateSettings(shop.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "sync") {
      await enqueueOrderSync({ shopId: shop.id, shopDomain: shop.shopDomain });
      return { ok: true, message: "Order sync started" };
    }

    if (intent === "export") {
      const url = new URL(request.url);
      const params = parseOrdersPageParams(url, settings.defaultColumns);
      const job = await requestCsvExport({
        shopId: shop.id,
        filters: params.filters,
        sort: params.sort,
      });
      return { ok: true, message: `Export queued (job ${job.id}). Check Settings > exports shortly.` };
    }

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
      let shopifyOrderIds = JSON.parse(String(formData.get("orderIds") ?? "[]")) as string[];
      const idsAreMetadataIds = String(formData.get("idKind") ?? "") === "metadata";
      if (idsAreMetadataIds) {
        const rows = await prisma.orderMetadata.findMany({
          where: { id: { in: shopifyOrderIds }, shopId: shop.id },
          select: { shopifyOrderId: true },
        });
        shopifyOrderIds = rows.map((r) => r.shopifyOrderId);
      }
      const result = await applyBulkAction({
        shopId: shop.id,
        shopDomain: shop.shopDomain,
        shopifyOrderIds,
        action: actionPayload,
      });
      return { ok: true, message: `Bulk action queued for ${result.queued} orders` };
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

function cellFor(column: OrderColumnId, order: LoaderData["orders"][number]) {
  switch (column) {
    case "name":
      return <Text as="span" variant="bodyMd" fontWeight="semibold">{order.name}</Text>;
    case "orderedAt":
      return new Date(order.orderedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    case "customerName":
      return order.customerName ?? "-";
    case "email":
      return order.email ?? "-";
    case "phone":
      return order.phone ?? "-";
    case "financialStatus":
      return <FinancialStatusBadge status={order.financialStatus} />;
    case "fulfillmentStatus":
      return <FulfillmentStatusBadge status={order.fulfillmentStatus} />;
    case "totalPrice":
      return order.totalPrice ? `${order.currency ?? ""} ${Number(order.totalPrice).toLocaleString("en-IN")}` : "-";
    case "currency":
      return order.currency ?? "-";
    case "itemCount":
      return `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`;
    case "tags":
      return order.tags.length ? (
        <InlineStack gap="100">{order.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</InlineStack>
      ) : "-";
    case "notes":
      return order.latestNote ? (
        <Text as="span" tone="subdued" truncate>{order.latestNote}</Text>
      ) : "-";
    case "shippingAddress": {
      const a = order.shippingAddress as { city?: string; provinceCode?: string } | null;
      return a ? [a.city, a.provinceCode].filter(Boolean).join(", ") || "-" : "-";
    }
    case "deliveryDate":
      return order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("en-IN") : "-";
    case "codStatus":
      return <CodBadge status={order.codStatus} />;
    case "assignedStaff":
      return order.assignedStaffName ?? "-";
    case "riskLevel":
      return <RiskBadge level={order.riskLevel} />;
    default:
      return "-";
  }
}

const SORTABLE: OrderColumnId[] = ["name", "orderedAt", "customerName", "totalPrice", "itemCount"];

export default function OrdersPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [searchParams] = useSearchParams();

  const [queryValue, setQueryValue] = useState(data.filters.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingBulk, setPendingBulk] = useState<null | string>(null);
  const [tagValue, setTagValue] = useState("");
  const [noteValue, setNoteValue] = useState("");
  const [staffValue, setStaffValue] = useState("");
  const [codValue, setCodValue] = useState("VERIFIED");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  const navigateWith = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams);
      params.delete("cursor");
      params.delete("cursorDir");
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined || value === "" || value === "ANY") params.delete(key);
        else params.set(key, value);
      }
      const s = params.toString();
      navigate(`/app/orders${s ? `?${s}` : ""}`);
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

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(data.orders as never);

  const selectedOrderRows = useMemo(
    () => data.orders.filter((o) => selectedResources.includes(o.id as never)),
    [data.orders, selectedResources],
  );

  const runBulk = (payload: BulkActionPayload) => {
    fetcher.submit(
      {
        intent: "bulk",
        bulkAction: JSON.stringify(payload),
        orderIds: JSON.stringify(selectedResources),
        idKind: "metadata",
      },
      { method: "post" },
    );
  };

  const confirmBulkModal = () => {
    if (pendingBulk === "addTag") runBulk({ type: "ADD_TAG", tag: tagValue.trim() });
    if (pendingBulk === "removeTag") runBulk({ type: "REMOVE_TAG", tag: tagValue.trim() });
    if (pendingBulk === "addNote") runBulk({ type: "ADD_NOTE", content: noteValue.trim() });
    if (pendingBulk === "assign") runBulk({ type: "ASSIGN_STAFF", staffId: staffValue });
    if (pendingBulk === "cod") runBulk({ type: "SET_COD_STATUS", codStatus: codValue });
    setPendingBulk(null);
    setTagValue("");
    setNoteValue("");
  };

  const bulkActions = [
    { content: "Add tag", onAction: () => setPendingBulk("addTag") },
    { content: "Remove tag", onAction: () => setPendingBulk("removeTag") },
    { content: "Add note", onAction: () => setPendingBulk("addNote") },
    { content: "Assign staff", onAction: () => setPendingBulk("assign") },
    { content: "Mark COD status", onAction: () => setPendingBulk("cod") },
    {
      content: "Unassign staff",
      onAction: () => runBulk({ type: "UNASSIGN_STAFF" }),
    },
    {
      content: "Print selected",
      onAction: () =>
        navigate(`/app/print?ids=${selectedResources.join(",")}`),
    },
    {
      content: "Open in Shopify Admin",
      onAction: () => {
        selectedOrderRows.slice(0, 10).forEach((o) =>
          window.open(adminOrderUrl(data.shopDomain, o.shopifyOrderId), "_blank"),
        );
      },
    },
  ];

  const appliedFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];
  const f = data.filters;
  if (f.fulfillment !== "ANY") appliedFilters.push({ key: "fulfillment", label: `Fulfillment: ${f.fulfillment.toLowerCase()}`, onRemove: () => navigateWith({ fulfillment: undefined }) });
  if (f.financial !== "ANY") appliedFilters.push({ key: "financial", label: `Payment: ${f.financial.toLowerCase()}`, onRemove: () => navigateWith({ financial: undefined }) });
  if (f.cod !== "ANY") appliedFilters.push({ key: "cod", label: `COD: ${f.cod.replace(/_/g, " ").toLowerCase()}`, onRemove: () => navigateWith({ cod: undefined }) });
  if (f.highValueOnly) appliedFilters.push({ key: "hv", label: "High value", onRemove: () => navigateWith({ hv: undefined }) });
  if (f.hasNotes) appliedFilters.push({ key: "notes", label: "Has notes", onRemove: () => navigateWith({ notes: undefined }) });
  if (f.hasTags) appliedFilters.push({ key: "tags", label: "Has tags", onRemove: () => navigateWith({ tags: undefined }) });
  if (f.tag) appliedFilters.push({ key: "tag", label: `Tag: ${f.tag}`, onRemove: () => navigateWith({ tag: undefined }) });
  if (f.assigned !== "ANY") appliedFilters.push({ key: "assigned", label: f.assigned === "ASSIGNED" ? "Assigned" : "Unassigned", onRemove: () => navigateWith({ assigned: undefined }) });
  if (f.staffId) {
    const staffName = data.staff.find((s) => s.id === f.staffId)?.name ?? "staff";
    appliedFilters.push({ key: "staff", label: `Staff: ${staffName}`, onRemove: () => navigateWith({ staff: undefined }) });
  }
  if (f.dateRange !== "ANY") appliedFilters.push({ key: "range", label: f.dateRange.replace(/_/g, " ").toLowerCase(), onRemove: () => navigateWith({ range: undefined }) });

  const filterConfigs = [
    {
      key: "fulfillment",
      label: "Fulfillment",
      filter: (
        <ChoiceList
          title="Fulfillment"
          titleHidden
          choices={[
            { label: "Any", value: "ANY" },
            { label: "Fulfilled", value: "FULFILLED" },
            { label: "Unfulfilled", value: "UNFULFILLED" },
          ]}
          selected={[f.fulfillment]}
          onChange={(v) => navigateWith({ fulfillment: v[0] })}
        />
      ),
      shortcut: true,
    },
    {
      key: "financial",
      label: "Payment status",
      filter: (
        <ChoiceList
          title="Payment status"
          titleHidden
          choices={[
            { label: "Any", value: "ANY" },
            { label: "Paid", value: "PAID" },
            { label: "Pending payment", value: "PENDING" },
          ]}
          selected={[f.financial]}
          onChange={(v) => navigateWith({ financial: v[0] })}
        />
      ),
      shortcut: true,
    },
    {
      key: "cod",
      label: "COD",
      filter: (
        <ChoiceList
          title="COD"
          titleHidden
          choices={[
            { label: "Any", value: "ANY" },
            { label: "COD orders", value: "COD" },
            { label: "Pending COD verification", value: "COD_PENDING" },
            { label: "Verified COD", value: "COD_VERIFIED" },
            { label: "Not COD", value: "NOT_COD" },
          ]}
          selected={[f.cod]}
          onChange={(v) => navigateWith({ cod: v[0] })}
        />
      ),
      shortcut: true,
    },
    {
      key: "range",
      label: "Date",
      filter: (
        <ChoiceList
          title="Date"
          titleHidden
          choices={[
            { label: "Any time", value: "ANY" },
            { label: "Today", value: "TODAY" },
            { label: "Last 7 days", value: "LAST_7_DAYS" },
            { label: "Last 30 days", value: "LAST_30_DAYS" },
          ]}
          selected={[f.dateRange]}
          onChange={(v) => navigateWith({ range: v[0] })}
        />
      ),
      shortcut: true,
    },
    {
      key: "assigned",
      label: "Assignment",
      filter: (
        <ChoiceList
          title="Assignment"
          titleHidden
          choices={[
            { label: "Any", value: "ANY" },
            { label: "Assigned", value: "ASSIGNED" },
            { label: "Unassigned", value: "UNASSIGNED" },
          ]}
          selected={[f.assigned]}
          onChange={(v) => navigateWith({ assigned: v[0] })}
        />
      ),
    },
    {
      key: "staff",
      label: "Staff member",
      filter: (
        <ChoiceList
          title="Staff member"
          titleHidden
          choices={data.staff.map((s) => ({ label: s.name, value: s.id }))}
          selected={f.staffId ? [f.staffId] : []}
          onChange={(v) => navigateWith({ staff: v[0] })}
        />
      ),
    },
    {
      key: "extras",
      label: "More",
      filter: (
        <ChoiceList
          title="More"
          titleHidden
          allowMultiple
          choices={[
            { label: "High-value orders", value: "hv" },
            { label: "Orders with notes", value: "notes" },
            { label: "Orders with tags", value: "tags" },
          ]}
          selected={[f.highValueOnly ? "hv" : "", f.hasNotes ? "notes" : "", f.hasTags ? "tags" : ""].filter(Boolean)}
          onChange={(values) =>
            navigateWith({
              hv: values.includes("hv") ? "1" : undefined,
              notes: values.includes("notes") ? "1" : undefined,
              tags: values.includes("tags") ? "1" : undefined,
            })
          }
        />
      ),
    },
  ];

  const visibleColumns = ORDER_COLUMNS.filter((c) => data.columns.includes(c.id));
  const sortColumnIndex = visibleColumns.findIndex((c) => c.id === data.sort.column);

  const rowMarkup = data.orders.map((order, index) => (
    <IndexTable.Row
      id={order.id}
      key={order.id}
      selected={selectedResources.includes(order.id as never)}
      position={index}
      onClick={() => navigate(`/app/orders/${encodeURIComponent(order.shopifyOrderId)}`)}
    >
      {visibleColumns.map((column) => (
        <IndexTable.Cell key={column.id}>{cellFor(column.id, order)}</IndexTable.Cell>
      ))}
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Orders"
      primaryAction={{
        content: "Sync orders",
        onAction: () => fetcher.submit({ intent: "sync" }, { method: "post" }),
        loading: fetcher.state !== "idle" && fetcher.formData?.get("intent") === "sync",
      }}
      secondaryActions={[
        {
          content: "Export CSV",
          onAction: () => fetcher.submit({ intent: "export" }, { method: "post" }),
        },
        { content: "Save current view", onAction: () => setSaveViewOpen(true) },
      ]}
    >
      <Layout>
        <Layout.Section>
          <SummaryCards data={data.metrics} />
        </Layout.Section>

        {fetcher.data?.message ? (
          <Layout.Section>
            <Banner tone={fetcher.data.ok ? "success" : "critical"}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card padding="0">
            <div style={{ padding: "12px 16px", display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <Select
                  label="Saved views"
                  labelHidden
                  options={[
                    { label: "All orders", value: "" },
                    ...data.views.map((v) => ({ label: v.name, value: v.id })),
                  ]}
                  value=""
                  onChange={(viewId) => {
                    const view = data.views.find((v) => v.id === viewId);
                    if (!view) {
                      navigate("/app/orders");
                      return;
                    }
                    const vf = view.filters as Record<string, string | boolean | undefined>;
                    navigate(
                      `/app/orders${buildOrdersSearch(
                        { ...data.filters, ...(vf as unknown as typeof data.filters) },
                        (view.sort as never) ?? data.sort,
                        (view.columns as OrderColumnId[])?.length ? (view.columns as OrderColumnId[]) : data.columns,
                      )}`,
                    );
                  }}
                />
              </div>
              <ColumnChooser
                selected={data.columns}
                onApply={(columns) => {
                  fetcher.submit(
                    { intent: "columns", columns: columns.join(",") },
                    { method: "post" },
                  );
                  navigateWith({ cols: columns.join(",") });
                }}
              />
            </div>
            <Filters
              queryValue={queryValue}
              queryPlaceholder="Search order number, customer, email, phone"
              filters={filterConfigs}
              appliedFilters={appliedFilters}
              onQueryChange={onSearchChange}
              onQueryClear={() => onSearchChange("")}
              onClearAll={() => navigate("/app/orders")}
            />
            {data.orders.length === 0 ? (
              <EmptyState
                heading={data.hasOrders || queryValue ? "No orders match these filters" : "No orders synced yet"}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {data.hasOrders || queryValue
                    ? "Try clearing some filters or search terms."
                    : "Use the Sync orders button to pull orders from Shopify."}
                </p>
              </EmptyState>
            ) : (
              <>
                <IndexTable
                  resourceName={{ singular: "order", plural: "orders" }}
                  itemCount={data.orders.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={visibleColumns.map((c) => ({ title: c.label })) as [{ title: string }, ...Array<{ title: string }>]}
                  bulkActions={bulkActions}
                  sortable={visibleColumns.map((c) => SORTABLE.includes(c.id))}
                  sortColumnIndex={sortColumnIndex >= 0 ? sortColumnIndex : undefined}
                  sortDirection={data.sort.direction === "asc" ? "ascending" : "descending"}
                  onSort={(index, direction) => {
                    const column = visibleColumns[index];
                    if (!column) return;
                    navigateWith({
                      sort: column.id,
                      dir: direction === "ascending" ? "asc" : "desc",
                    });
                  }}
                >
                  {rowMarkup}
                </IndexTable>
                <div style={{ padding: "12px", display: "flex", justifyContent: "center" }}>
                  <Pagination
                    hasNext={Boolean(data.nextCursor)}
                    hasPrevious={Boolean(data.previousCursor)}
                    onNext={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("cursor", data.nextCursor ?? "");
                      params.set("cursorDir", "forward");
                      navigate(`/app/orders?${params.toString()}`);
                    }}
                    onPrevious={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("cursor", data.previousCursor ?? "");
                      params.set("cursorDir", "backward");
                      navigate(`/app/orders?${params.toString()}`);
                    }}
                  />
                </div>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={pendingBulk !== null}
        onClose={() => setPendingBulk(null)}
        title={
          pendingBulk === "addTag" ? "Add tag"
          : pendingBulk === "removeTag" ? "Remove tag"
          : pendingBulk === "addNote" ? "Add internal note"
          : pendingBulk === "assign" ? "Assign staff"
          : "Mark COD status"
        }
        primaryAction={{
          content: "Apply",
          onAction: confirmBulkModal,
          disabled:
            (pendingBulk === "addTag" || pendingBulk === "removeTag") ? !tagValue.trim()
            : pendingBulk === "addNote" ? !noteValue.trim()
            : pendingBulk === "assign" ? !staffValue
            : false,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setPendingBulk(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              {selectedResources.length} order{selectedResources.length === 1 ? "" : "s"} selected
            </Text>
            {pendingBulk === "addTag" || pendingBulk === "removeTag" ? (
              <TextField label="Tag" autoComplete="off" value={tagValue} onChange={setTagValue} />
            ) : null}
            {pendingBulk === "addNote" ? (
              <TextField label="Note" autoComplete="off" value={noteValue} onChange={setNoteValue} multiline={3} />
            ) : null}
            {pendingBulk === "assign" ? (
              <Select
                label="Staff member"
                options={[{ label: "Choose staff", value: "" }, ...data.staff.map((s) => ({ label: s.name, value: s.id }))]}
                value={staffValue}
                onChange={setStaffValue}
              />
            ) : null}
            {pendingBulk === "cod" ? (
              <Select
                label="COD status"
                options={[
                  { label: "Pending", value: "PENDING" },
                  { label: "Verified", value: "VERIFIED" },
                  { label: "Failed", value: "FAILED" },
                  { label: "Cancelled", value: "CANCELLED" },
                ]}
                value={codValue}
                onChange={setCodValue}
              />
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        title="Save current view"
        primaryAction={{
          content: "Save view",
          disabled: !viewName.trim(),
          onAction: () => {
            fetcher.submit({ intent: "saveView", viewName: viewName.trim() }, { method: "post" });
            setSaveViewOpen(false);
            setViewName("");
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setSaveViewOpen(false) }]}
      >
        <Modal.Section>
          <TextField
            label="View name"
            autoComplete="off"
            placeholder='e.g. "Today\u2019s COD"'
            value={viewName}
            onChange={setViewName}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
