import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { prisma } from "@order-operations/db";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type ApplyBulkActionJob,
} from "@order-operations/shared";
import { adminGraphql } from "../services/shopify-admin";
import { getOfflineAccessToken } from "../services/session-lookup";

const TAGS_ADD = `#graphql
  mutation TagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { message } }
  }
`;

const TAGS_REMOVE = `#graphql
  mutation TagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) { userErrors { message } }
  }
`;

@Processor(QUEUE_NAMES.BULK_ACTION)
export class BulkActionProcessor extends WorkerHost {
  async process(job: Job<ApplyBulkActionJob>): Promise<void> {
    if (job.name !== JOB_NAMES.APPLY_BULK_ACTION) return;
    const { shopId, shopDomain, shopifyOrderIds, action, requestedById } = job.data;

    let accessToken: string | null = null;
    if (action.type === "ADD_TAG" || action.type === "REMOVE_TAG") {
      accessToken = await getOfflineAccessToken(shopDomain);
    }

    let processed = 0;
    for (const shopifyOrderId of shopifyOrderIds) {
      try {
        switch (action.type) {
          case "ADD_TAG":
          case "REMOVE_TAG": {
            const mutation = action.type === "ADD_TAG" ? TAGS_ADD : TAGS_REMOVE;
            await adminGraphql(
              { shopDomain, accessToken: accessToken as string },
              mutation,
              { id: shopifyOrderId, tags: [action.tag] },
            );
            // Reflect the change in the local index immediately.
            const order = await prisma.orderMetadata.findUnique({
              where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
              select: { id: true, tags: true },
            });
            if (order) {
              const tags =
                action.type === "ADD_TAG"
                  ? Array.from(new Set([...order.tags, action.tag]))
                  : order.tags.filter((t) => t !== action.tag);
              await prisma.orderMetadata.update({
                where: { id: order.id },
                data: { tags },
              });
            }
            break;
          }
          case "ADD_NOTE": {
            await prisma.$transaction(async (tx) => {
              await tx.orderNote.create({
                data: {
                  shopId,
                  shopifyOrderId,
                  content: action.content.slice(0, 5000),
                  authorId: requestedById ?? null,
                },
              });
              await tx.orderMetadata.updateMany({
                where: { shopId, shopifyOrderId },
                data: {
                  latestNote: action.content.slice(0, 200),
                  notesCount: { increment: 1 },
                },
              });
            });
            break;
          }
          case "ASSIGN_STAFF": {
            await prisma.$transaction(async (tx) => {
              await tx.orderAssignment.create({
                data: { shopId, shopifyOrderId, staffId: action.staffId },
              });
              await tx.orderMetadata.updateMany({
                where: { shopId, shopifyOrderId },
                data: { assignedStaffId: action.staffId },
              });
            });
            break;
          }
          case "UNASSIGN_STAFF": {
            await prisma.orderMetadata.updateMany({
              where: { shopId, shopifyOrderId },
              data: { assignedStaffId: null },
            });
            break;
          }
          case "SET_COD_STATUS": {
            await prisma.orderMetadata.updateMany({
              where: { shopId, shopifyOrderId },
              data: { codStatus: action.codStatus as never },
            });
            break;
          }
        }
        processed++;
      } catch (error) {
        // One failing order must not abort the rest of the batch.
        console.error(
          `Bulk action ${action.type} failed for order ${shopifyOrderId}`,
          error,
        );
      }
      await job.updateProgress(Math.round((processed / shopifyOrderIds.length) * 100));
    }
    console.log(`Bulk action ${action.type}: ${processed}/${shopifyOrderIds.length} orders`);
  }
}
