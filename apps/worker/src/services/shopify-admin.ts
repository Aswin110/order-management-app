// Minimal Shopify Admin GraphQL client backed by the stored offline
// session access token. Handles throttling with retry + backoff.

export interface ShopifyAdminClientOptions {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  maxRetries?: number;
}

export class ShopifyThrottledError extends Error {}

export async function adminGraphql<T = unknown>(
  options: ShopifyAdminClientOptions,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const apiVersion = options.apiVersion ?? "2025-10";
  const url = `https://${options.shopDomain}/admin/api/${apiVersion}/graphql.json`;
  const maxRetries = options.maxRetries ?? 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": options.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      await sleep(backoff(attempt));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string; extensions?: { code?: string } }>;
    };

    const throttled = body.errors?.some(
      (e) => e.extensions?.code === "THROTTLED",
    );
    if (throttled) {
      await sleep(backoff(attempt));
      continue;
    }
    if (body.errors?.length) {
      throw new Error(
        `Shopify GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!body.data) throw new Error("Shopify GraphQL response had no data");
    return body.data;
  }
  throw new ShopifyThrottledError("Shopify API throttled after retries");
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000) + Math.floor(Math.random() * 250);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
