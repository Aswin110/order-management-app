export const ORDER_COLUMNS = [
  { id: "name", label: "Order" },
  { id: "orderedAt", label: "Date" },
  { id: "customerName", label: "Customer" },
  { id: "phone", label: "Phone" },
  { id: "items", label: "Items" },
  { id: "totalPrice", label: "Total" },
  { id: "financialStatus", label: "Payment" },
  { id: "fulfillmentStatus", label: "Fulfillment" },
  { id: "tags", label: "Tags" },
  { id: "notes", label: "Notes" },
  { id: "codStatus", label: "COD status" },
  { id: "assignedStaff", label: "Assigned staff" },
] as const;

export type OrderColumnId = (typeof ORDER_COLUMNS)[number]["id"];

export const DEFAULT_COLUMNS: OrderColumnId[] = [
  "name",
  "orderedAt",
  "customerName",
  "items",
  "totalPrice",
  "financialStatus",
  "fulfillmentStatus",
  "tags",
  "notes",
  "codStatus",
];
