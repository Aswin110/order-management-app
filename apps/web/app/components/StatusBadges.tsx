import { Badge } from "@shopify/polaris";

export function FinancialStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "UNKNOWN";
  const tone =
    s === "PAID" ? "success"
    : s === "PENDING" || s === "AUTHORIZED" ? "attention"
    : s === "REFUNDED" || s === "VOIDED" ? "info"
    : undefined;
  return <Badge tone={tone as never}>{s.replace(/_/g, " ")}</Badge>;
}

export function FulfillmentStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "UNFULFILLED";
  const tone =
    s === "FULFILLED" ? "success"
    : s === "PARTIALLY_FULFILLED" ? "attention"
    : undefined;
  return <Badge tone={tone as never}>{s.replace(/_/g, " ")}</Badge>;
}

export function RiskBadge({ level }: { level: string | null }) {
  if (!level || level === "NONE") return null;
  const tone = level === "HIGH" ? "critical" : level === "MEDIUM" ? "attention" : "info";
  return <Badge tone={tone as never}>{`${level.charAt(0)}${level.slice(1).toLowerCase()} risk`}</Badge>;
}
