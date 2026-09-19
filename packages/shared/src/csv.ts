// Pure CSV building for order exports. Tested without any network or database.

import type { OrderListItem } from "./admin-orders";
import { lineItemSummary } from "./admin-orders";

export const CSV_HEADERS = [
  "Order",
  "Created date",
  "Customer",
  "Email",
  "Phone",
  "Items",
  "Total",
  "Currency",
  "Financial status",
  "Fulfillment status",
  "COD status",
  "Tags",
  "Assigned staff",
] as const;

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function orderToCsvRow(order: OrderListItem): string {
  const cells = [
    order.name,
    order.orderedAt ?? "",
    order.customerName ?? "",
    order.email ?? "",
    order.phone ?? "",
    order.items.map(lineItemSummary).join("; "),
    order.totalPrice ?? "",
    order.currency ?? "",
    order.financialStatus ?? "",
    order.fulfillmentStatus ?? "",
    order.codStatus,
    order.tags.join(" "),
    order.assignedStaffName ?? "",
  ];
  return cells.map(escapeCsvCell).join(",");
}

export function buildOrdersCsv(orders: OrderListItem[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const order of orders) {
    lines.push(orderToCsvRow(order));
  }
  return lines.join("\n") + "\n";
}
