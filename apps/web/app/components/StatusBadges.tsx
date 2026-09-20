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

