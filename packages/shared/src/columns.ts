export const ORDER_COLUMNS = [
  { id: "name", label: "Order" },
  { id: "orderedAt", label: "Date" },
  { id: "customerName", label: "Customer" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "financialStatus", label: "Payment" },
  { id: "fulfillmentStatus", label: "Fulfillment" },
  { id: "totalPrice", label: "Total" },
  { id: "currency", label: "Currency" },
  { id: "itemCount", label: "Items" },
  { id: "tags", label: "Tags" },
  { id: "notes", label: "Notes" },
  { id: "shippingAddress", label: "Shipping address" },
  { id: "deliveryDate", label: "Delivery date" },
  { id: "codStatus", label: "COD status" },
  { id: "assignedStaff", label: "Assigned staff" },
  { id: "riskLevel", label: "Risk level" },
] as const;

export type OrderColumnId = (typeof ORDER_COLUMNS)[number]["id"];

export const DEFAULT_COLUMNS: OrderColumnId[] = [
  "name",
  "orderedAt",
  "customerName",
  "phone",
  "financialStatus",
  "fulfillmentStatus",
  "totalPrice",
  "itemCount",
  "tags",
  "notes",
  "codStatus",
  "assignedStaff",
];
