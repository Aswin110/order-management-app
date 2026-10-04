import {
  isImageUrl,
  isUrl,
  type AdminLineItemCustomAttribute,
} from "@order-operations/shared";

/**
 * A line item's personalisation. A value that is a link (uploaded artwork, a
 * proof) opens in a new tab, with a thumbnail when it points at an image;
 * everything else is a "key: value" chip.
 */
export function Customizations({ attributes }: { attributes: AdminLineItemCustomAttribute[] }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      {attributes.map((attr, index) => {
        // A key can repeat on one line item, so it is not unique on its own.
        const key = `${attr.key}-${index}`;
        if (!isUrl(attr.value)) {
          return (
            <s-chip key={key}>
              {attr.key}: {attr.value}
            </s-chip>
          );
        }
        const href = attr.value.trim();
        return (
          <s-stack key={key} direction="inline" gap="small-500" alignItems="center">
            {isImageUrl(href) ? <s-thumbnail src={href} alt={attr.key} size="small-200" /> : null}
            <s-link href={href} target="_blank">
              {attr.key}
            </s-link>
          </s-stack>
        );
      })}
    </s-stack>
  );
}
