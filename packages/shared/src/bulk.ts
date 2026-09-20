// Bulk actions write tags straight to Shopify - the only order data this
// app ever writes. Everything else about an order is read-only.
export type BulkActionPayload =
  | { type: "ADD_TAG"; tag: string }
  | { type: "REMOVE_TAG"; tag: string };
