import { useState } from "react";
import { Button, Popover, BlockStack, Checkbox } from "@shopify/polaris";
import { ORDER_COLUMNS, type OrderColumnId } from "@order-operations/shared";

export function ColumnChooser(props: {
  selected: OrderColumnId[];
  onApply: (columns: OrderColumnId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OrderColumnId[]>(props.selected);

  const toggle = (id: OrderColumnId) => {
    setDraft((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  };

  return (
    <Popover
      active={open}
      activator={<Button onClick={() => { setDraft(props.selected); setOpen(true); }}>Columns</Button>}
      onClose={() => setOpen(false)}
      preferredAlignment="right"
    >
      <Popover.Pane>
        <BlockStack gap="200">
          <div style={{ padding: "12px 12px 0" }}>
            <BlockStack gap="200">
              {ORDER_COLUMNS.map((column) => (
                <Checkbox
                  key={column.id}
                  label={column.label}
                  checked={draft.includes(column.id)}
                  onChange={() => toggle(column.id)}
                />
              ))}
            </BlockStack>
          </div>
          <div style={{ padding: "12px" }}>
            <Button
              variant="primary"
              disabled={draft.length === 0}
              onClick={() => { props.onApply(draft); setOpen(false); }}
            >
              Apply
            </Button>
          </div>
        </BlockStack>
      </Popover.Pane>
    </Popover>
  );
}
