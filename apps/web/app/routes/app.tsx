import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings } from "../services/settings.server";
import {
  billingEnforced,
  hasActiveSubscription,
  planSelectionUrl,
} from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin, redirect } = await authenticate.admin(request);

  const shop = await ensureShop(session.shop, session.scope);
  await getOrCreateSettings(shop.id);

  // Every /app route sits under this one, so a shop without a plan lands on
  // Shopify's hosted plan page whichever route it opened.
  if (billingEnforced() && !(await hasActiveSubscription(admin, session.shop))) {
    return redirect(planSelectionUrl(session.shop), { target: "_top" });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app/orders">Orders</s-link>
        <s-link href="/app/production">Production summary</s-link>
        <s-link href="/app/views">Saved views</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
