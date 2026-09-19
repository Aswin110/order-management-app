export interface SummaryData {
  todayOrders: number;
  todayRevenue: string;
  unfulfilled: number;
  codPending: number;
  highValue: number;
  currency: string;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function SummaryCards({ data }: { data: SummaryData }) {
  return (
    <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
      <Metric label="Today's orders" value={String(data.todayOrders)} />
      <Metric label="Today's revenue" value={formatMoney(data.todayRevenue, data.currency)} />
      <Metric label="Unfulfilled" value={String(data.unfulfilled)} />
      <Metric label="COD pending" value={String(data.codPending)} />
      <Metric label="High value" value={String(data.highValue)} />
    </s-grid>
  );
}
