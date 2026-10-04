-- Workflow configuration: stage labels, staff names, and whether internal
-- line item properties are shown. The workflow state of an order is not
-- stored here - it lives in Shopify order tags.

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "workflowStages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "staffNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "showInternalProperties" BOOLEAN NOT NULL DEFAULT false;
