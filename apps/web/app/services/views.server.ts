import prisma from "../db.server";
import {
  savedViewInputSchema,
  type OrderFilters,
  type OrderSort,
} from "@order-operations/shared";

export async function listSavedViews(shopId: string) {
  return prisma.savedView.findMany({
    where: { shopId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSavedView(options: {
  shopId: string;
  name: string;
  filters: OrderFilters;
  sort?: OrderSort;
  columns?: string[];
}) {
  const parsed = savedViewInputSchema.parse({
    name: options.name,
    filters: options.filters,
    sort: options.sort,
    columns: options.columns ?? [],
  });
  return prisma.savedView.create({
    data: {
      shopId: options.shopId,
      name: parsed.name,
      filters: parsed.filters,
      sort: parsed.sort ?? undefined,
      columns: parsed.columns,
    },
  });
}

export async function updateSavedView(
  shopId: string,
  viewId: string,
  options: { name?: string; filters?: OrderFilters; sort?: OrderSort; columns?: string[] },
) {
  const view = await prisma.savedView.findFirst({ where: { id: viewId, shopId } });
  if (!view) throw new Error("Saved view not found");
  return prisma.savedView.update({
    where: { id: view.id },
    data: {
      ...(options.name !== undefined ? { name: options.name.trim().slice(0, 80) } : {}),
      ...(options.filters !== undefined ? { filters: options.filters } : {}),
      ...(options.sort !== undefined ? { sort: options.sort } : {}),
      ...(options.columns !== undefined ? { columns: options.columns } : {}),
    },
  });
}

export async function duplicateSavedView(shopId: string, viewId: string) {
  const view = await prisma.savedView.findFirst({ where: { id: viewId, shopId } });
  if (!view) throw new Error("Saved view not found");
  return prisma.savedView.create({
    data: {
      shopId,
      name: `${view.name} (copy)`.slice(0, 80),
      filters: view.filters as object,
      sort: (view.sort as object | null) ?? undefined,
      columns: view.columns,
    },
  });
}

export async function deleteSavedView(shopId: string, viewId: string) {
  const view = await prisma.savedView.findFirst({ where: { id: viewId, shopId } });
  if (!view) throw new Error("Saved view not found");
  return prisma.savedView.delete({ where: { id: view.id } });
}
