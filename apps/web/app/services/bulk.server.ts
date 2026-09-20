// Inline bulk tagging. Selections are capped at one page of orders, so the
// mutations run directly in the web process against Shopify - no worker or
// queue. Tags are the only order data this app writes.

import type { BulkActionPayload } from "@order-operations/shared";

interface AdminGraphql {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

export const MAX_INLINE_BULK = 50;

const TAGS_ADD_MUTATION = `#graphql
  mutation TagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      userErrors { field message }
    }
  }
`;

const TAGS_REMOVE_MUTATION = `#graphql
  mutation TagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      userErrors { field message }
    }
  }
`;

async function mutateTags(
  admin: AdminGraphql,
  mutation: string,
  shopifyOrderIds: string[],
  tag: string,
) {
  for (const id of shopifyOrderIds) {
    const body = (await (
      await admin.graphql(mutation, { variables: { id, tags: [tag] } })
    ).json()) as {
      data?: { tagsAdd?: { userErrors?: Array<{ message?: string }> } } & {
        tagsRemove?: { userErrors?: Array<{ message?: string }> };
      };
      errors?: Array<{ message?: string }>;
    };
    const userErrors =
      body.data?.tagsAdd?.userErrors ?? body.data?.tagsRemove?.userErrors ?? [];
    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message ?? "GraphQL error").join("; "));
    }
    if (userErrors.length) {
      throw new Error(userErrors.map((e) => e.message ?? "Rejected").join("; "));
    }
  }
}

/**
 * Applies a bulk tag change immediately, writing to Shopify (the source of
 * truth). Returns how many orders were updated.
 */
export async function applyBulkAction(options: {
  admin: AdminGraphql;
  shopifyOrderIds: string[];
  action: BulkActionPayload;
}) {
  const { admin, shopifyOrderIds, action } = options;
  if (!shopifyOrderIds.length) throw new Error("No orders selected");
  if (shopifyOrderIds.length > MAX_INLINE_BULK) {
    throw new Error(`Too many orders selected (max ${MAX_INLINE_BULK} per bulk action)`);
  }

  switch (action.type) {
    case "ADD_TAG": {
      const tag = action.tag.trim();
      if (!tag) throw new Error("Tag cannot be empty");
      await mutateTags(admin, TAGS_ADD_MUTATION, shopifyOrderIds, tag);
      break;
    }
    case "REMOVE_TAG": {
      const tag = action.tag.trim();
      if (!tag) throw new Error("Tag cannot be empty");
      await mutateTags(admin, TAGS_REMOVE_MUTATION, shopifyOrderIds, tag);
      break;
    }
  }
  return { applied: shopifyOrderIds.length };
}
