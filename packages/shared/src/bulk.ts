export type BulkActionPayload =
  | { type: "ADD_TAG"; tag: string }
  | { type: "REMOVE_TAG"; tag: string }
  | { type: "ADD_NOTE"; content: string; authorId?: string }
  | { type: "ASSIGN_STAFF"; staffId: string }
  | { type: "UNASSIGN_STAFF" }
  | { type: "SET_COD_STATUS"; codStatus: string };
