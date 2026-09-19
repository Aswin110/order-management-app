import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Preserve the search string: Shopify admin loads the app with ?shop=&host=,
  // and App Bridge reads them off the page URL. Dropping them here makes
  // app-bridge.js fail with "missing required configuration fields: shop".
  const { search } = new URL(request.url);
  return redirect(`/app/orders${search}`);
};
