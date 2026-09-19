export const QUEUE_NAMES = {
  ORDER_SYNC: "order-sync",
  CSV_EXPORT: "csv-export",
  BULK_ACTION: "bulk-action",
} as const;

export const JOB_NAMES = {
  SYNC_SHOP_ORDERS: "sync-shop-orders",
  GENERATE_CSV: "generate-csv",
  APPLY_BULK_ACTION: "apply-bulk-action",
} as const;

export interface SyncShopOrdersJob {
  shopId: string;
  shopDomain: string;
  /** ISO date; sync orders created/updated since this time. Omit for full sync. */
  since?: string;
}

export interface GenerateCsvJob {
  exportJobId: string;
  shopId: string;
}

export type BulkActionPayload =
  | { type: "ADD_TAG"; tag: string }
  | { type: "REMOVE_TAG"; tag: string }
  | { type: "ADD_NOTE"; content: string; authorId?: string }
  | { type: "ASSIGN_STAFF"; staffId: string }
  | { type: "UNASSIGN_STAFF" }
  | { type: "SET_COD_STATUS"; codStatus: string };

export interface ApplyBulkActionJob {
  shopId: string;
  shopDomain: string;
  shopifyOrderIds: string[];
  action: BulkActionPayload;
  requestedById?: string;
}
