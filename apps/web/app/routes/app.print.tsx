// Print views for the selected orders, read live from Shopify:
//   ?type=jobsheet  one page per order for the production floor
//   ?type=packing   one page per order to go in the parcel (no prices)
//   ?type=list      all selected orders in one table (the default)

import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  isImageUrl,
  isUrl,
  mapAdminOrderToListItem,
  lineItemSummary,
  visibleAttributes,
  workflowLabel,
  type OrderLineItem,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings, workflowConfig } from "../services/settings.server";
import { fetchOrdersByIds } from "../services/shopify-orders.server";

type PrintType = "jobsheet" | "packing" | "list";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const workflow = workflowConfig(await getOrCreateSettings(shop.id));

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map((id) => decodeURIComponent(id))
    .slice(0, 50);
  const requested = url.searchParams.get("type");
  const type: PrintType =
    requested === "jobsheet" || requested === "packing" ? requested : "list";

  const nodes = await fetchOrdersByIds(admin, ids);
  const orders = nodes.map((node) => ({
    ...mapAdminOrderToListItem(node),
    // Who the parcel is for, which can differ from the customer.
    recipient: node.shippingAddress?.name ?? null,
    recipientPhone: node.shippingAddress?.phone ?? null,
  }));
  return { orders, type, workflow };
};

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type PrintOrder = LoaderData["orders"][number];

const PRINT_CSS = `
  .print-root { font-family: Inter, sans-serif; color: #000; }
  .sheet { padding: 24px; break-after: page; }
  .sheet:last-child { break-after: auto; }
  .sheet h1 { font-size: 22px; margin: 0 0 4px; }
  .sheet table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  .sheet th { text-align: left; border-bottom: 2px solid #000; padding: 6px; }
  .sheet td { border-bottom: 1px solid #ccc; padding: 6px; vertical-align: top; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-top: 12px; }
  .label { color: #555; }
  .note { margin-top: 12px; padding: 8px; border: 1px solid #000; }
  .quantity { font-size: 20px; font-weight: 700; white-space: nowrap; }
  .artwork { display: block; max-width: 160px; max-height: 160px; margin-top: 4px; }
  .toolbar { padding: 12px 24px; }
  @media print { .toolbar { display: none; } }
`;

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN") : "";
}

/** A line item's personalisation, with uploaded images printed inline. */
function PrintCustomizations({ item, showInternal }: { item: OrderLineItem; showInternal: boolean }) {
  const attributes = visibleAttributes(item.customAttributes, showInternal);
  if (!attributes.length) return null;
  return (
    <div>
      {attributes.map((attr, index) => (
        <div key={`${attr.key}-${index}`}>
          <strong>{attr.key}:</strong>{" "}
          {isImageUrl(attr.value) ? (
            <img className="artwork" src={attr.value.trim()} alt={attr.key} />
          ) : isUrl(attr.value) ? (
            <span style={{ wordBreak: "break-all" }}>{attr.value}</span>
          ) : (
            attr.value
          )}
        </div>
      ))}
    </div>
  );
}

function JobSheet({ order, workflow }: { order: PrintOrder; workflow: LoaderData["workflow"] }) {
  const stage = workflowLabel(order.workflow.stage, workflow.stages);
  const assignee = workflowLabel(order.workflow.assignee, workflow.staff);
  return (
    <section className="sheet">
      <h1>Job sheet {order.name}</h1>
      <div className="label">{formatDate(order.orderedAt)}</div>
      <div className="meta">
        <div><span className="label">Customer:</span> {order.customerName ?? "-"}</div>
        <div><span className="label">Phone:</span> {order.phone ?? "-"}</div>
        <div><span className="label">Delivery:</span> {order.deliveryMethod ?? "-"}</div>
        <div><span className="label">Ship to:</span> {order.shipTo ?? "-"}</div>
        <div><span className="label">Stage:</span> {stage ?? "-"}</div>
        <div><span className="label">Assigned to:</span> {assignee ?? "-"}</div>
      </div>
      {order.note ? <div className="note"><strong>Order note:</strong> {order.note}</div> : null}
      <table>
        <thead>
          <tr><th>To make</th><th></th><th>Item</th><th>Customizations</th></tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="quantity">
                {item.unfulfilledQuantity}
                {item.unfulfilledQuantity !== item.quantity ? ` of ${item.quantity}` : ""}
              </td>
              <td>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.imageAlt ?? item.title} width={64} height={64} style={{ objectFit: "cover" }} />
                ) : null}
              </td>
              <td>
                <strong>{item.title}</strong>
                {item.variantTitle ? <div>{item.variantTitle}</div> : null}
                {item.sku ? <div className="label">SKU: {item.sku}</div> : null}
                {item.vendor ? <div className="label">{item.vendor}</div> : null}
              </td>
              <td><PrintCustomizations item={item} showInternal={workflow.showInternalProperties} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.hasMoreItems ? <p>This order has more items than fit here; open it in Shopify for the rest.</p> : null}
    </section>
  );
}

function PackingSlip({ order, workflow }: { order: PrintOrder; workflow: LoaderData["workflow"] }) {
  return (
    <section className="sheet">
      <h1>Packing slip {order.name}</h1>
      <div className="label">{formatDate(order.orderedAt)}</div>
      <div className="meta">
        <div>
          <div className="label">Ship to</div>
          <div><strong>{order.recipient ?? order.customerName ?? "-"}</strong></div>
          <div>{order.shipToFull ?? "-"}</div>
          {order.recipientPhone ?? order.phone ? <div>{order.recipientPhone ?? order.phone}</div> : null}
        </div>
        <div>
          <div><span className="label">Delivery:</span> {order.deliveryMethod ?? "-"}</div>
          {order.cod ? (
            <div><strong>Cash on delivery: collect {order.currency ?? ""} {order.totalPrice ?? ""}</strong></div>
          ) : null}
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Qty</th><th>Item</th><th>Customizations</th></tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="quantity">{item.quantity}</td>
              <td>
                <strong>{item.title}</strong>
                {item.variantTitle ? <div>{item.variantTitle}</div> : null}
                {item.sku ? <div className="label">SKU: {item.sku}</div> : null}
              </td>
              <td><PrintCustomizations item={item} showInternal={workflow.showInternalProperties} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.note ? <div className="note"><strong>Order note:</strong> {order.note}</div> : null}
    </section>
  );
}

function OrderList({ orders }: { orders: PrintOrder[] }) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18 }}>Order Operations - selected orders ({orders.length})</h1>
      <table style={{ borderCollapse: "collapse", width: "100%" }} cellPadding={6}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #000" }}>
            <th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Items</th>
            <th>Payment</th><th>Fulfillment</th><th>Total</th><th>COD</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.shopifyOrderId} style={{ borderBottom: "1px solid #ccc" }}>
              <td>{o.name}</td>
              <td>{formatDate(o.orderedAt)}</td>
              <td>{o.customerName ?? ""}</td>
              <td>{o.phone ?? ""}</td>
              <td>
                {o.items.map((item) => (
                  <div key={item.id}>
                    {lineItemSummary(item)}
                    {item.customAttributes.length
                      ? ` (${item.customAttributes.map((a) => `${a.key}: ${a.value}`).join(", ")})`
                      : ""}
                  </div>
                ))}
              </td>
              <td>{o.financialStatus ?? ""}</td>
              <td>{o.fulfillmentStatus ?? ""}</td>
              <td>{o.totalPrice ? `${o.currency ?? ""} ${o.totalPrice}` : ""}</td>
              <td>{o.cod ? "Yes" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrintPage() {
  const { orders, type, workflow } = useLoaderData<typeof loader>();

  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="toolbar">
        <Link to="/app/orders">Back to orders</Link>
      </div>
      {type === "jobsheet"
        ? orders.map((o) => <JobSheet key={o.shopifyOrderId} order={o} workflow={workflow} />)
        : type === "packing"
          ? orders.map((o) => <PackingSlip key={o.shopifyOrderId} order={o} workflow={workflow} />)
          : <OrderList orders={orders} />}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
