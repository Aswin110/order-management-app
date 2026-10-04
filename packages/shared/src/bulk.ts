import type { WorkflowGroup } from "./workflow";

// Bulk actions write tags straight to Shopify - the only order data this
// app ever writes. Workflow changes (stage, assignee, COD confirmation) are
// tags too. Everything else about an order is read-only.
export type BulkActionPayload =
  | { type: "ADD_TAG"; tag: string }
  | { type: "REMOVE_TAG"; tag: string }
  | { type: "SET_WORKFLOW"; group: WorkflowGroup; value: string | null };
