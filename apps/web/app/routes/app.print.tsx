import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  mapAdminOrderToListItem,
  lineItemSummary,
  type OrderListItem,
} from "@order-operations/shared";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { fetchOrdersByIds } from "../services/shopify-orders.server";
import { getOrderOverlays } from "../services/overlay.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .map((id) => decodeURIComponent(id))
    .slice(0, 50);

  const nodes = await fetchOrdersByIds(admin, ids);
  const overlays = await getOrderOverlays(shop.id, nodes.map((n) => n.id));

  const orders: OrderListItem[] = nodes.map((n) =>
    mapAdminOrderToListItem(n, overlays.get(n.id) ?? null),
  );
  return { orders };
};

export default function PrintPage() {
  const { orders } = useLoaderData<typeof loader>();

  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: 24 }}>
      <h1 style={{ fontSize: 18 }}>Order Operations - selected orders ({orders.length})</h1>
      <table style={{ borderCollapse: "collapse", width: "100%" }} cellPadding={6}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #000" }}>
            <th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Items</th>
            <th>Payment</th><th>Fulfillment</th><th>Total</th>
            <th>COD</th><th>Staff</th><th>Note</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.shopifyOrderId} style={{ borderBottom: "1px solid #ccc" }}>
              <td>{o.name}</td>
              <td>{o.orderedAt ? new Date(o.orderedAt).toLocaleString("en-IN") : ""}</td>
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
              <td>{o.cod ? o.codStatus : ""}</td>
              <td>{o.assignedStaffName ?? ""}</td>
              <td>{o.latestNote ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
