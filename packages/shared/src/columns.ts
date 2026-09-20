// Columns of the order summary row. Line items are not a column: they
// always render in the full-width band under each order.
export const ORDER_COLUMNS = [
  { id: "name", label: "Order" },
  { id: "orderedAt", label: "Date" },
  { id: "customerName", label: "Customer" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "totalPrice", label: "Total" },
  { id: "financialStatus", label: "Payment" },
  { id: "fulfillmentStatus", label: "Fulfillment" },
  { id: "cod", label: "COD" },
  { id: "tags", label: "Tags" },
] as const;

export type OrderColumnId = (typeof ORDER_COLUMNS)[number]["id"];

export const DEFAULT_COLUMNS: OrderColumnId[] = [
  "name",
  "orderedAt",
  "customerName",
  "phone",
  "totalPrice",
  "financialStatus",
  "fulfillmentStatus",
  "cod",
  "tags",
];
