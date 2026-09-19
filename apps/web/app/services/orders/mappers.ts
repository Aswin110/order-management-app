// Canonical implementation lives in @order-operations/shared so the web
// app and the background worker map Shopify orders identically.
export {
  mapShopifyOrder,
  isCodOrder,
  type MappedOrder,
} from "@order-operations/shared";
