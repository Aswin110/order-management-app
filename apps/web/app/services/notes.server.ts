import prisma from "../db.server";

/** App-internal notes. These never overwrite Shopify customer-facing order data. */
export async function addOrderNote(options: {
  shopId: string;
  shopifyOrderId: string;
  content: string;
  authorId?: string | null;
}) {
  const { shopId, shopifyOrderId, content, authorId } = options;
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Note content cannot be empty");
  if (trimmed.length > 5000) throw new Error("Note is too long (max 5000 characters)");

  return prisma.$transaction(async (tx) => {
    const note = await tx.orderNote.create({
      data: { shopId, shopifyOrderId, content: trimmed, authorId: authorId ?? null },
    });
    // Keep the overlay preview in sync for fast list display. The overlay
    // is created on first use; orders never need to be synced first.
    await tx.orderOpsMeta.upsert({
      where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
      create: {
        shopId,
        shopifyOrderId,
        latestNote: trimmed.slice(0, 200),
        notesCount: 1,
      },
      update: {
        latestNote: trimmed.slice(0, 200),
        notesCount: { increment: 1 },
      },
    });
    return note;
  });
}

export async function listOrderNotes(shopId: string, shopifyOrderId: string) {
  return prisma.orderNote.findMany({
    where: { shopId, shopifyOrderId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });
}

export async function deleteOrderNote(shopId: string, noteId: string) {
  return prisma.$transaction(async (tx) => {
    const note = await tx.orderNote.findFirst({ where: { id: noteId, shopId } });
    if (!note) throw new Error("Note not found");
    await tx.orderNote.delete({ where: { id: note.id } });
    const remaining = await tx.orderNote.findFirst({
      where: { shopId, shopifyOrderId: note.shopifyOrderId },
      orderBy: { createdAt: "desc" },
    });
    const remainingCount = await tx.orderNote.count({
      where: { shopId, shopifyOrderId: note.shopifyOrderId },
    });
    await tx.orderOpsMeta.updateMany({
      where: { shopId, shopifyOrderId: note.shopifyOrderId },
      data: {
        latestNote: remaining ? remaining.content.slice(0, 200) : null,
        notesCount: remainingCount,
      },
    });
  });
}
