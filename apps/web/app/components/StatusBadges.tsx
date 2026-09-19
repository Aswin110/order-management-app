type Tone = "success" | "warning" | "critical" | "info" | "neutral";

export function FinancialStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "UNKNOWN";
  const tone: Tone =
    s === "PAID" ? "success"
    : s === "PENDING" || s === "AUTHORIZED" ? "warning"
    : s === "REFUNDED" || s === "VOIDED" ? "info"
    : "neutral";
  return <s-badge tone={tone}>{s.replace(/_/g, " ")}</s-badge>;
}

export function FulfillmentStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "UNFULFILLED";
  const tone: Tone =
    s === "FULFILLED" ? "success"
    : s === "PARTIALLY_FULFILLED" ? "warning"
    : "neutral";
  return <s-badge tone={tone}>{s.replace(/_/g, " ")}</s-badge>;
}

export function RiskBadge({ level }: { level: string | null }) {
  if (!level || level === "NONE") return null;
  const tone: Tone = level === "HIGH" ? "critical" : level === "MEDIUM" ? "warning" : "info";
  return <s-badge tone={tone}>{`${level.charAt(0)}${level.slice(1).toLowerCase()} risk`}</s-badge>;
}
