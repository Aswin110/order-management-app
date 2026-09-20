import prisma from "../db.server";
import { DEFAULT_COLUMNS, type OrderColumnId } from "@order-operations/shared";

export async function getOrCreateSettings(shopId: string) {
  const existing = await prisma.shopSettings.findUnique({ where: { shopId } });
  if (existing) return existing;
  return prisma.shopSettings.create({
    data: { shopId, defaultColumns: DEFAULT_COLUMNS },
  });
}

export interface SettingsInput {
  defaultSort?: string | null;
  defaultViewId?: string | null;
  defaultColumns?: OrderColumnId[];
  rowsPerPage?: number;
}

export async function updateSettings(shopId: string, input: SettingsInput) {
  await getOrCreateSettings(shopId);
  return prisma.shopSettings.update({
    where: { shopId },
    data: {
      ...(input.defaultSort !== undefined ? { defaultSort: input.defaultSort } : {}),
      ...(input.defaultViewId !== undefined
        ? { defaultViewId: input.defaultViewId }
        : {}),
      ...(input.defaultColumns !== undefined
        ? { defaultColumns: input.defaultColumns }
        : {}),
      ...(input.rowsPerPage !== undefined
        ? { rowsPerPage: Math.min(Math.max(input.rowsPerPage, 10), 250) }
        : {}),
    },
  });
}
