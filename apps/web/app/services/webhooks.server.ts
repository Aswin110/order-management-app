import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { ensureShop } from "./shop.server";
import { mapShopifyOrder } from "@order-operations/shared";

/**
 * Idempotently process an order webhook. Shopify may deliver the same
 * webhook more than once; the X-Shopify-Webhook-Id delivery id is stored
 * in WebhookEvent with a unique constraint, so redeliveries short-circuit.
 */
export async function processOrderWebhook(options: {
  shopDomain: string;
  topic: string;
  webhookId: string;
  payload: Record<string, unknown>;
}) {
  const { shopDomain, topic, webhookId, payload } = options;

  const existing = await prisma.webhookEvent.findUnique({
    where: { shopifyWebhookId: webhookId },
  });
  if (existing?.status === "PROCESSED") return { duplicate: true };

  const shop = await ensureShop(shopDomain);

  if (!existing) {
    try {
      await prisma.webhookEvent.create({
        data: {
          shopId: shop.id,
          shopifyWebhookId: webhookId,
          topic,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Unique constraint race: another instance recorded it first.
      return { duplicate: true, raced: true };
    }
  }

  try {
    const prelim = mapShopifyOrder(payload as never);
    const prior = await prisma.orderMetadata.findUnique({
      where: {
        shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: prelim.shopifyOrderId },
      },
      select: { codStatus: true },
    });
    const mapped = mapShopifyOrder(payload as never, prior?.codStatus);

    const prismaData = {
      name: mapped.name,
      orderedAt: mapped.orderedAt,
      customerName: mapped.customerName,
      email: mapped.email,
      phone: mapped.phone,
      financialStatus: mapped.financialStatus,
      fulfillmentStatus: mapped.fulfillmentStatus,
      totalPrice: mapped.totalPrice,
      currency: mapped.currency,
      itemCount: mapped.itemCount,
      tags: mapped.tags,
      riskLevel: mapped.riskLevel,
      shippingAddress: mapped.shippingAddress
        ? (mapped.shippingAddress as Prisma.InputJsonValue)
        : undefined,
      cancelledAt: mapped.cancelledAt,
      syncedAt: new Date(),
    };

    await prisma.orderMetadata.upsert({
      where: {
        shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: mapped.shopifyOrderId },
      },
      create: {
        shopId: shop.id,
        shopifyOrderId: mapped.shopifyOrderId,
        codStatus: mapped.codStatus,
        ...prismaData,
      },
      update: { codStatus: mapped.codStatus, ...prismaData },
    });

    await prisma.webhookEvent.update({
      where: { shopifyWebhookId: webhookId },
      data: { status: "PROCESSED", processedAt: new Date(), shopId: shop.id },
    });
    return { duplicate: false };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { shopifyWebhookId: webhookId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
      },
    });
    throw error;
  }
}
