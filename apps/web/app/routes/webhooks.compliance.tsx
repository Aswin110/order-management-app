import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory compliance webhooks. The app keeps no customer data - orders are
// read live from Shopify and never stored - so the two customer topics have
// nothing to return or erase. shop/redact arrives 48 hours after an
// uninstall and removes everything stored for the shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  // The topic arrives as "SHOP_REDACT" or "shop/redact" depending on the
  // library version.
  if (String(topic).toUpperCase().replace(/\//g, "_") === "SHOP_REDACT") {
    // Saved views and settings go with the shop row (cascade).
    await db.shop.deleteMany({ where: { shopDomain: shop } });
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
