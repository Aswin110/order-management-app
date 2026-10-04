// Production workflow state (stage, assignee, COD confirmation) is stored as
// Shopify order tags. Shopify stays the source of truth: the state shows up in
// the Shopify admin, survives an uninstall, and is filterable with the
// native `tag:` search - no local order table needed.

export type WorkflowGroup = "stage" | "assignee" | "cod";

const TAG_PREFIX: Record<WorkflowGroup, string> = {
  stage: "stage:",
  assignee: "assigned:",
  cod: "cod:",
};

const GROUPS = Object.keys(TAG_PREFIX) as WorkflowGroup[];

/** Stages a shop starts with until it sets its own in Settings. */
export const DEFAULT_STAGES = ["To make", "In production", "Packed"];

export const COD_STATUSES = [
  { id: "confirmed", label: "Confirmed" },
  { id: "declined", label: "Declined" },
] as const;

/** Filter value meaning "no stage set" / "nobody assigned". */
export const WORKFLOW_NONE = "none";

// Shopify caps a tag at 40 characters; the longest prefix is 9.
const MAX_SLUG_LENGTH = 30;

/** "In production" -> "in-production". Keeps letters of any script. */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    // \p{M} keeps the combining vowel signs Indic scripts are written with.
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}

export function workflowTag(group: WorkflowGroup, value: string): string {
  return `${TAG_PREFIX[group]}${slugify(value)}`;
}

function groupOf(tag: string): WorkflowGroup | null {
  const lower = tag.toLowerCase();
  return GROUPS.find((g) => lower.startsWith(TAG_PREFIX[g])) ?? null;
}

export function isWorkflowTag(tag: string): boolean {
  return groupOf(tag) !== null;
}

/** The order's tags without the workflow ones, for showing as plain tags. */
export function plainTags(tags: string[]): string[] {
  return tags.filter((t) => !isWorkflowTag(t));
}

export interface WorkflowState {
  /** Slug of the current stage, e.g. "in-production". */
  stage: string | null;
  /** Slug of the person the order is assigned to. */
  assignee: string | null;
  /** "confirmed" | "declined"; null means not confirmed yet. */
  cod: string | null;
}

export function readWorkflow(tags: string[]): WorkflowState {
  const state: WorkflowState = { stage: null, assignee: null, cod: null };
  for (const tag of tags) {
    const group = groupOf(tag);
    if (!group || state[group]) continue;
    const slug = tag.slice(TAG_PREFIX[group].length).toLowerCase();
    if (slug) state[group] = slug;
  }
  return state;
}

/**
 * The display label for a slug: the configured label it was made from, or
 * the slug itself when the label has since been removed from Settings.
 */
export function workflowLabel(slug: string | null, labels: readonly string[]): string | null {
  if (!slug) return null;
  return labels.find((l) => slugify(l) === slug) ?? slug.replace(/-/g, " ");
}

/**
 * Tags to add and remove so that `group` ends up at `value` (null clears it).
 * A group holds at most one value, so any other tag in the group is removed.
 */
export function workflowTagChange(
  currentTags: string[],
  group: WorkflowGroup,
  value: string | null,
): { add: string[]; remove: string[] } {
  const target = value ? workflowTag(group, value) : null;
  const inGroup = currentTags.filter((t) => groupOf(t) === group);
  const remove = inGroup.filter((t) => t.toLowerCase() !== target);
  const alreadySet = target !== null && inGroup.some((t) => t.toLowerCase() === target);
  return { add: target && !alreadySet ? [target] : [], remove };
}
