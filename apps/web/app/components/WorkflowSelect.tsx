import { slugify, workflowLabel } from "@order-operations/shared";

/**
 * One-click picker for a workflow value (stage, assignee, COD status). The
 * value is the slug stored in the order's tag; options are the labels from
 * Settings. A value whose label was since removed still shows, so changing
 * Settings never hides what an order is tagged with.
 */
export function WorkflowSelect(props: {
  /** Read by screen readers; the picker itself shows only the value. */
  label: string;
  value: string | null;
  options: readonly string[];
  emptyLabel: string;
  /** Shown before every option, e.g. "COD: ", when the value alone is ambiguous. */
  prefix?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const options = props.options.map((label) => ({ slug: slugify(label), label }));
  if (props.value && !options.some((o) => o.slug === props.value)) {
    options.push({ slug: props.value, label: workflowLabel(props.value, []) ?? props.value });
  }

  return (
    <s-select
      label={props.label}
      labelAccessibilityVisibility="exclusive"
      value={props.value ?? ""}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.value || null)}
    >
      <s-option value="">{props.emptyLabel}</s-option>
      {options.map((o) => (
        <s-option key={o.slug} value={o.slug}>
          {props.prefix ? `${props.prefix}${o.label.toLowerCase()}` : o.label}
        </s-option>
      ))}
    </s-select>
  );
}
