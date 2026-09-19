import { prisma } from "@order-operations/db";

/** Finds the offline access token stored by the Shopify session storage. */
export async function getOfflineAccessToken(shopDomain: string): Promise<string> {
  const session = await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false },
    orderBy: { expires: "desc" },
  });
  if (!session?.accessToken) {
    throw new Error(`No offline session found for ${shopDomain}. Reinstall the app.`);
  }
  return session.accessToken;
}
