import prisma from "../db.server";

export async function listStaff(shopId: string, includeInactive = false) {
  return prisma.staff.findMany({
    where: { shopId, ...(includeInactive ? {} : { active: true }) },
    orderBy: { name: "asc" },
  });
}

export async function createStaff(options: {
  shopId: string;
  name: string;
  email?: string | null;
}) {
  const name = options.name.trim();
  if (!name) throw new Error("Staff name is required");
  return prisma.staff.create({
    data: { shopId: options.shopId, name, email: options.email?.trim() || null },
  });
}

export async function setStaffActive(shopId: string, staffId: string, active: boolean) {
  const staff = await prisma.staff.findFirst({ where: { id: staffId, shopId } });
  if (!staff) throw new Error("Staff member not found");
  return prisma.staff.update({ where: { id: staff.id }, data: { active } });
}

/**
 * Assign (or reassign) an order to a staff member. Works on any Shopify
 * order id - the overlay row is created on first use, no sync required.
 */
export async function assignOrder(options: {
  shopId: string;
  shopifyOrderId: string;
  staffId: string;
}) {
  const { shopId, shopifyOrderId, staffId } = options;
  const staff = await prisma.staff.findFirst({ where: { id: staffId, shopId, active: true } });
  if (!staff) throw new Error("Staff member not found");

  return prisma.$transaction(async (tx) => {
    await tx.orderAssignment.create({ data: { shopId, shopifyOrderId, staffId } });
    return tx.orderOpsMeta.upsert({
      where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
      create: { shopId, shopifyOrderId, assignedStaffId: staffId },
      update: { assignedStaffId: staffId },
    });
  });
}

export async function unassignOrder(options: { shopId: string; shopifyOrderId: string }) {
  return prisma.orderOpsMeta.updateMany({
    where: { shopId: options.shopId, shopifyOrderId: options.shopifyOrderId },
    data: { assignedStaffId: null },
  });
}
