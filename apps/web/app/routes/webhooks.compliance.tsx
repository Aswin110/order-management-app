import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory compliance webhooks. The app stores no customer data beyond
// the operational order index, which is scoped to the shop and removed
// on uninstall; nothing further to do here for the MVP.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);
  return new Response();
};
