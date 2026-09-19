import { useState } from "react";
import { ORDER_COLUMNS, type OrderColumnId } from "@order-operations/shared";

const POPOVER_ID = "order-columns-popover";

export function ColumnChooser(props: {
  selected: OrderColumnId[];
  onApply: (columns: OrderColumnId[]) => void;
}) {
  const [draft, setDraft] = useState<OrderColumnId[]>(props.selected);

  const toggle = (id: OrderColumnId) => {
    setDraft((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  };

  return (
    <>
      {/* s-popover is driven declaratively by the command API rather than an
          `active` prop, so there is no open/close state to track here. */}
      <s-button commandFor={POPOVER_ID} command="--show" onClick={() => setDraft(props.selected)}>
        Columns
      </s-button>
      <s-popover id={POPOVER_ID} inlineSize="260px">
        <s-box padding="base">
          <s-stack direction="block" gap="base">
            {ORDER_COLUMNS.map((column) => (
              <s-checkbox
                key={column.id}
                label={column.label}
                checked={draft.includes(column.id)}
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
