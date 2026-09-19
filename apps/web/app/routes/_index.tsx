import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify admin opens the app at "/" with ?shop=...&host=...; hand off to the
  // embedded app so the Polaris shell in app.tsx takes over.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function Index() {
  return (
    <main
      style={{
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        maxWidth: "36rem",
        margin: "0 auto",
        padding: "4rem 1.5rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ marginBottom: "0.5rem" }}>Order Operations</h1>
      <p style={{ color: "#616161" }}>
        A fast daily operations workflow for Shopify orders: configurable
        columns, saved views, filters, bulk actions, internal notes, staff
        assignment, and COD verification.
      </p>
      <p style={{ color: "#616161" }}>
        This is a Shopify embedded app. Open it from your store admin.
      </p>
    </main>
  );
}
