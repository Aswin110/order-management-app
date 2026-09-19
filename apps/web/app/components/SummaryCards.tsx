import { Card, InlineGrid, Text, BlockStack } from "@shopify/polaris";

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
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="headingLg">{value}</Text>
      </BlockStack>
    </Card>
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
    <InlineGrid columns={{ xs: 2, md: 5 }} gap="300">
      <Metric label="Today's orders" value={String(data.todayOrders)} />
      <Metric label="Today's revenue" value={formatMoney(data.todayRevenue, data.currency)} />
      <Metric label="Unfulfilled" value={String(data.unfulfilled)} />
      <Metric label="COD pending" value={String(data.codPending)} />
      <Metric label="High value" value={String(data.highValue)} />
    </InlineGrid>
  );
}
