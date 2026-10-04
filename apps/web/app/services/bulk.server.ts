// Inline bulk tagging. Selections are capped at one page of orders, so the
// mutations run directly in the web process against Shopify - no worker or
// queue. Tags are the only order data this app writes; a workflow change
// (stage, assignee, COD confirmation) is a tag swap.

import type { BulkActionPayload, WorkflowGroup } from "@order-operations/shared";
import { slugify, workflowTagChange } from "@order-operations/shared";

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

const ORDER_TAGS_QUERY = `#graphql
  query OrderTags($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order { id tags }
    }
  }
`;

async function mutateTags(
  admin: AdminGraphql,
  mutation: string,
  shopifyOrderIds: string[],
  tags: string[],
) {
  for (const id of shopifyOrderIds) {
    const body = (await (
      await admin.graphql(mutation, { variables: { id, tags } })
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
 * Moves each order's workflow group to `value` (null clears it). The current
 * tags are read first so the group's previous value is removed, whatever it
 * was - including a stage that has since been deleted from Settings.
 */
async function setWorkflow(
  admin: AdminGraphql,
  shopifyOrderIds: string[],
  group: WorkflowGroup,
  value: string | null,
) {
  if (value !== null && !slugify(value)) throw new Error("Value cannot be empty");

  const body = (await (
    await admin.graphql(ORDER_TAGS_QUERY, { variables: { ids: shopifyOrderIds } })
  ).json()) as {
    data?: { nodes?: Array<{ id?: string; tags?: string[] } | null> };
    errors?: Array<{ message?: string }>;
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message ?? "GraphQL error").join("; "));
  }

  for (const node of body.data?.nodes ?? []) {
    if (!node?.id) continue;
    const change = workflowTagChange(node.tags ?? [], group, value);
    if (change.remove.length) {
      await mutateTags(admin, TAGS_REMOVE_MUTATION, [node.id], change.remove);
    }
    if (change.add.length) {
      await mutateTags(admin, TAGS_ADD_MUTATION, [node.id], change.add);
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
      await mutateTags(admin, TAGS_ADD_MUTATION, shopifyOrderIds, [tag]);
      break;
    }
    case "REMOVE_TAG": {
      const tag = action.tag.trim();
      if (!tag) throw new Error("Tag cannot be empty");
      await mutateTags(admin, TAGS_REMOVE_MUTATION, shopifyOrderIds, [tag]);
      break;
    }
    case "SET_WORKFLOW":
      await setWorkflow(admin, shopifyOrderIds, action.group, action.value);
      break;
  }
  return { applied: shopifyOrderIds.length };
}
