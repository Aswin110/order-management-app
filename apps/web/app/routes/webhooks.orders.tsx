import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processOrderWebhook } from "../services/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // authenticate.webhook verifies the Shopify HMAC signature.
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);

  try {
    await processOrderWebhook({
      shopDomain: shop,
      topic,
      webhookId,
      payload: payload as Record<string, unknown>,
    });
  } catch (error) {
    console.error(`Webhook ${topic} for ${shop} failed`, error);
    // Return 500 so Shopify retries the delivery.
    return new Response("Webhook processing failed", { status: 500 });
  }
  return new Response();
};
