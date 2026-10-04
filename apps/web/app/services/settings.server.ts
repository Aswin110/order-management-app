import prisma from "../db.server";
import {
  DEFAULT_COLUMNS,
  DEFAULT_STAGES,
  WORKFLOW_NONE,
  slugify,
  type OrderColumnId,
} from "@order-operations/shared";

export async function getOrCreateSettings(shopId: string) {
  const existing = await prisma.shopSettings.findUnique({ where: { shopId } });
  if (existing) return existing;
  return prisma.shopSettings.create({
    data: { shopId, defaultColumns: DEFAULT_COLUMNS },
  });
}

/** The shop's workflow configuration, with the defaults filled in. */
export function workflowConfig(settings: {
  workflowStages?: string[] | null;
  staffNames?: string[] | null;
  showInternalProperties?: boolean | null;
}) {
  return {
    stages: settings.workflowStages?.length ? settings.workflowStages : DEFAULT_STAGES,
    staff: settings.staffNames ?? [],
    showInternalProperties: settings.showInternalProperties ?? false,
  };
}

export type WorkflowConfig = ReturnType<typeof workflowConfig>;

export interface SettingsInput {
  defaultSort?: string | null;
  defaultViewId?: string | null;
  defaultColumns?: OrderColumnId[];
  rowsPerPage?: number;
  workflowStages?: string[];
  staffNames?: string[];
  showInternalProperties?: boolean;
}

const MAX_STAGES = 12;
const MAX_STAFF = 50;
const MAX_LABEL_LENGTH = 30;

/**
 * Trims labels and drops blanks, plus any label that would produce the same
 * tag as an earlier one or clash with the "none" filter value.
 */
function cleanLabels(labels: string[], max: number): string[] {
  const seen = new Set<string>([WORKFLOW_NONE]);
  const clean: string[] = [];
  for (const raw of labels) {
    const label = raw.trim().slice(0, MAX_LABEL_LENGTH).trim();
    const slug = slugify(label);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    clean.push(label);
  }
  return clean.slice(0, max);
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
      ...(input.workflowStages !== undefined
        ? { workflowStages: cleanLabels(input.workflowStages, MAX_STAGES) }
        : {}),
      ...(input.staffNames !== undefined
        ? { staffNames: cleanLabels(input.staffNames, MAX_STAFF) }
        : {}),
      ...(input.showInternalProperties !== undefined
        ? { showInternalProperties: input.showInternalProperties }
        : {}),
    },
  });
}
