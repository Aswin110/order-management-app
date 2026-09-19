import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureShop } from "../services/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);

  const orders = await prisma.orderMetadata.findMany({
    where: { id: { in: ids }, shopId: shop.id },
    orderBy: { orderedAt: "desc" },
    include: { assignedStaff: { select: { name: true } } },
  });

  return {
    orders: orders.map((o) => ({
      id: o.id,
      name: o.name,
      orderedAt: o.orderedAt.toISOString(),
      customerName: o.customerName,
      phone: o.phone,
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      totalPrice: o.totalPrice?.toString() ?? null,
      currency: o.currency,
      itemCount: o.itemCount,
      codStatus: o.codStatus,
      assignedStaffName: o.assignedStaff?.name ?? null,
      latestNote: o.latestNote,
    })),
  };
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
            <th>Order</th><th>Date</th><th>Customer</th><th>Phone</th>
            <th>Payment</th><th>Fulfillment</th><th>Total</th><th>Items</th>
            <th>COD</th><th>Staff</th><th>Note</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #ccc" }}>
              <td>{o.name}</td>
              <td>{new Date(o.orderedAt).toLocaleString("en-IN")}</td>
              <td>{o.customerName ?? ""}</td>
              <td>{o.phone ?? ""}</td>
              <td>{o.financialStatus ?? ""}</td>
              <td>{o.fulfillmentStatus ?? ""}</td>
              <td>{o.totalPrice ? `${o.currency ?? ""} ${o.totalPrice}` : ""}</td>
              <td>{o.itemCount}</td>
              <td>{o.codStatus}</td>
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
