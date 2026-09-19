import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { getOrCreateSettings } from "../services/settings.server";
import { enqueueOrderSync } from "../services/queues.server";
import prisma from "../db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await ensureShop(session.shop, session.scope);
  await getOrCreateSettings(shop.id);

  // On first app load after install, kick off the initial background sync.
  if (!shop.initialSyncEnqueuedAt) {
    try {
      await enqueueOrderSync({ shopId: shop.id, shopDomain: shop.shopDomain });
      await prisma.shop.update({
        where: { id: shop.id },
        data: { initialSyncEnqueuedAt: new Date() },
      });
    } catch (error) {
      // Redis may be down in local dev; the dashboard shows a manual sync button.
      console.error("Could not enqueue initial order sync", error);
    }
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
        <s-link href="/app/views">Saved views</s-link>
        <s-link href="/app/team">Team</s-link>
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
