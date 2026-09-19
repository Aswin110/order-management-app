// Pure CSV building for order exports. Tested without any database.

export interface CsvOrderRow {
  name: string;
  orderedAt: Date;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  totalPrice: unknown;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  codStatus: string;
  tags: string[];
  assignedStaff?: { name: string } | null;
}

export const CSV_HEADERS = [
  "Order",
  "Created date",
  "Customer",
  "Email",
  "Phone",
  "Total",
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

export function orderToCsvRow(order: CsvOrderRow): string {
  const cells = [
    order.name,
    order.orderedAt.toISOString(),
    order.customerName ?? "",
    order.email ?? "",
    order.phone ?? "",
    order.totalPrice?.toString() ?? "",
    order.financialStatus ?? "",
    order.fulfillmentStatus ?? "",
    order.codStatus,
    order.tags.join(" "),
    order.assignedStaff?.name ?? "",
  ];
  return cells.map(escapeCsvCell).join(",");
}

export function buildOrdersCsv(orders: CsvOrderRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const order of orders) {
    lines.push(orderToCsvRow(order));
  }
  return lines.join("\n") + "\n";
}
