import { useState, type CSSProperties, type DragEvent } from "react";

/**
 * Moves `id` to where `targetId` is, shifting the items in between. Dragging
 * forward lands after the target, dragging back lands before it - the item
 * ends up exactly where it was dropped.
 */
export function moveItem<T>(order: readonly T[], id: T, targetId: T): T[] {
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/**
 * Native drag-and-drop reordering of a list of ids. Spread `itemProps(id)`
 * onto each item's element; `onReorder` receives the new order on drop.
 * `axis` only decides which edge of the drop target is highlighted.
 */
export function useDragReorder<T extends string>(
  order: readonly T[],
  onReorder: (next: T[]) => void,
  axis: "horizontal" | "vertical",
) {
  const [dragging, setDragging] = useState<T | null>(null);
  const [over, setOver] = useState<T | null>(null);

  const reset = () => {
    setDragging(null);
    setOver(null);
  };

  const itemProps = (id: T) => {
    const style: CSSProperties = { cursor: "grab" };
    if (dragging === id) style.opacity = 0.4;
    if (dragging && over === id && dragging !== id) {
      // A line on the edge the dragged item will land on. An inset shadow
      // rather than a border, so showing it does not shift the layout.
      const forward = order.indexOf(dragging) < order.indexOf(id);
      const offset = forward ? "-2px" : "2px";
      style.boxShadow =
        axis === "horizontal" ? `inset ${offset} 0 0 currentColor` : `inset 0 ${offset} 0 currentColor`;
    }

    return {
      draggable: true,
      style,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox only starts a drag once some data has been set.
        event.dataTransfer.setData("text/plain", id);
        setDragging(id);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragging) return;
        // Without this the browser refuses the drop.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (over !== id) setOver(id);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (dragging && dragging !== id) onReorder(moveItem(order, dragging, id));
        reset();
      },
      onDragEnd: reset,
    };
  };

  return { itemProps };
}
