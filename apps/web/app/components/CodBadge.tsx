import { Badge } from "@shopify/polaris";

const TONE: Record<string, "success" | "attention" | "critical" | "info" | undefined> = {
  NOT_COD: undefined,
  PENDING: "attention",
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
  return <Badge tone={TONE[status]}>{LABEL[status] ?? status}</Badge>;
}
