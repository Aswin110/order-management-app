// Pure CSV building for order exports. Tested without any network or database.

import type { OrderListItem } from "./admin-orders";
import { lineItemSummary } from "./admin-orders";
import { visibleAttributes } from "./properties";
import { workflowLabel } from "./workflow";

/** Shop configuration the exports need to turn workflow slugs into labels. */
export interface CsvOptions {
  stages?: readonly string[];
  staff?: readonly string[];
  showInternal?: boolean;
}

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
  "COD",
  "Tags",
  "Units",
  "Payment method",
  "Delivery method",
  "Ship to",
  "Order note",
  "Stage",
  "Assigned to",
] as const;

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function orderToCsvRow(order: OrderListItem, options: CsvOptions = {}): string {
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
    order.cod ? "Yes" : "No",
    order.tags.join(" "),
    String(order.itemCount),
    order.paymentMethod ?? "",
    order.deliveryMethod ?? "",
    order.shipToFull ?? "",
    order.note ?? "",
    workflowLabel(order.workflow.stage, options.stages ?? []) ?? "",
    workflowLabel(order.workflow.assignee, options.staff ?? []) ?? "",
  ];
  return cells.map(escapeCsvCell).join(",");
}

export function buildOrdersCsv(orders: OrderListItem[], options: CsvOptions = {}): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const order of orders) {
    lines.push(orderToCsvRow(order, options));
  }
  return lines.join("\n") + "\n";
}

export const LINE_ITEM_CSV_HEADERS = [
  "Order",
  "Created date",
  "Customer",
  "Phone",
  "Item",
  "Variant",
  "SKU",
  "Vendor",
  "Quantity",
  "To make",
  "Unit price",
  "Line total",
  "Currency",
  "Stage",
  "Assigned to",
  "Ship to",
  "Order note",
] as const;

/**
 * One row per line item, with each customization in its own column so a
 * production sheet can be sorted and filtered by it. Customization columns
 * follow the fixed ones, in the order the keys first appear.
 */
export function buildLineItemsCsv(orders: OrderListItem[], options: CsvOptions = {}): string {
  const rows = orders.flatMap((order) =>
    order.items.map((item) => ({
      order,
      item,
      attributes: visibleAttributes(item.customAttributes, options.showInternal),
    })),
  );

  const customKeys: string[] = [];
  for (const row of rows) {
    for (const attr of row.attributes) {
      if (!customKeys.includes(attr.key)) customKeys.push(attr.key);
    }
  }

  const lines = [[...LINE_ITEM_CSV_HEADERS, ...customKeys].map(escapeCsvCell).join(",")];
  for (const { order, item, attributes } of rows) {
    const cells = [
      order.name,
      order.orderedAt ?? "",
      order.customerName ?? "",
      order.phone ?? "",
      item.title,
      item.variantTitle ?? "",
      item.sku ?? "",
      item.vendor ?? "",
      String(item.quantity),
      String(item.unfulfilledQuantity),
      item.unitPrice ?? "",
      item.lineTotal ?? "",
      order.currency ?? "",
      workflowLabel(order.workflow.stage, options.stages ?? []) ?? "",
      workflowLabel(order.workflow.assignee, options.staff ?? []) ?? "",
      order.shipToFull ?? "",
      order.note ?? "",
      // A key can repeat on one item; keep every value.
      ...customKeys.map((key) =>
        attributes
          .filter((a) => a.key === key)
          .map((a) => a.value)
          .join("; "),
      ),
    ];
    lines.push(cells.map(escapeCsvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
