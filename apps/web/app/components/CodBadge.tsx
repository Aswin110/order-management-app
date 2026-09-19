const TONE: Record<string, "success" | "warning" | "critical" | "info" | "neutral"> = {
  NOT_COD: "neutral",
  PENDING: "warning",
  VERIFIED: "success",
  FAILED: "critical",
  CANCELLED: "info",
};

const LABEL: Record<string, string> = {
  NOT_COD: "Not COD",
  PENDING: "COD pending",
  VERIFIED: "COD verified",
  FAILED: "COD failed",
  CANCELLED: "COD cancelled",
};

export function CodBadge({ status }: { status: string }) {
  return <s-badge tone={TONE[status] ?? "neutral"}>{LABEL[status] ?? status}</s-badge>;
}
