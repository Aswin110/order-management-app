// Inline bulk actions. Selections are capped at one page of orders, so
// actions run directly in the web process against Shopify (tags) and the
// operational overlay (notes, COD, assignment) - no worker or queue.

import type { BulkActionPayload } from "@order-operations/shared";
import { addOrderNote } from "./notes.server";
import { assignOrder, unassignOrder } from "./staff.server";
import { setCodStatus } from "./cod.server";

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
 * Applies a bulk action immediately. Tag changes are written to Shopify
 * (source of truth); notes, COD status, and assignment are app-internal
 * overlay data. Returns how many orders were updated.
 */
export async function applyBulkAction(options: {
  admin: AdminGraphql;
  shopId: string;
  shopifyOrderIds: string[];
  action: BulkActionPayload;
}) {
  const { admin, shopId, shopifyOrderIds, action } = options;
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
    case "ADD_NOTE": {
      for (const id of shopifyOrderIds) {
        await addOrderNote({ shopId, shopifyOrderId: id, content: action.content });
      }
      break;
    }
    case "ASSIGN_STAFF": {
      for (const id of shopifyOrderIds) {
        await assignOrder({ shopId, shopifyOrderId: id, staffId: action.staffId });
      }
      break;
    }
    case "UNASSIGN_STAFF": {
      for (const id of shopifyOrderIds) {
        await unassignOrder({ shopId, shopifyOrderId: id });
      }
      break;
    }
    case "SET_COD_STATUS": {
      for (const id of shopifyOrderIds) {
        await setCodStatus({
          shopId,
          shopifyOrderId: id,
          codStatus: action.codStatus as never,
        });
      }
      break;
    }
  }
  return { applied: shopifyOrderIds.length };
}
