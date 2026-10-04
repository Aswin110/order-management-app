import { useState } from "react";
import { ORDER_COLUMNS, type OrderColumnId } from "@order-operations/shared";

import { useDragReorder } from "../lib/drag-reorder";

const POPOVER_ID = "order-columns-popover";

const labelOf = (id: OrderColumnId) => ORDER_COLUMNS.find((c) => c.id === id)?.label ?? id;

/**
 * Picks which columns the orders table shows and in what order. The draft is
 * the shown columns, left to right; drag a row to move it. Nothing changes
 * until Apply.
 */
export function ColumnChooser(props: {
  selected: OrderColumnId[];
  onApply: (columns: OrderColumnId[]) => void;
}) {
  const [draft, setDraft] = useState<OrderColumnId[]>(props.selected);
  const drag = useDragReorder(draft, setDraft, "vertical");

  const toggle = (id: OrderColumnId) => {
    setDraft((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  };

  const hidden = ORDER_COLUMNS.filter((column) => !draft.includes(column.id));

  return (
    <>
      {/* s-popover is driven declaratively by the command API rather than an
          `active` prop, so there is no open/close state to track here. */}
      <s-button commandFor={POPOVER_ID} command="--show" onClick={() => setDraft(props.selected)}>
        Columns
      </s-button>
      <s-popover id={POPOVER_ID} inlineSize="280px">
        <s-box padding="base">
          <s-stack direction="block" gap="small-200">
            <s-text color="subdued">Shown - drag to reorder</s-text>
            {draft.map((id) => (
              <div key={id} {...drag.itemProps(id)}>
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-icon type="drag-handle" color="subdued" />
                  <s-checkbox label={labelOf(id)} checked onChange={() => toggle(id)} />
                </s-stack>
              </div>
            ))}
            {hidden.length ? <s-text color="subdued">Hidden</s-text> : null}
            {hidden.map((column) => (
              <s-checkbox
                key={column.id}
                label={column.label}
                checked={false}
                onChange={() => toggle(column.id)}
              />
            ))}
            <s-button
              variant="primary"
              disabled={draft.length === 0}
              commandFor={POPOVER_ID}
              command="--hide"
              onClick={() => props.onApply(draft)}
            >
              Apply
            </s-button>
          </s-stack>
        </s-box>
      </s-popover>
    </>
  );
}
