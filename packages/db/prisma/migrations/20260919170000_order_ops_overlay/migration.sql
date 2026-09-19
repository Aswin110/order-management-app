-- Reshape: orders are read live from Shopify, so the synced order index
-- (OrderMetadata), the webhook idempotency ledger (WebhookEvent), and the
-- background CSV export jobs (ExportJob) are dropped. App-internal
-- operational data moves to the lazily-created OrderOpsMeta overlay.

-- DropForeignKeys
ALTER TABLE "OrderAssignment" DROP CONSTRAINT IF EXISTS "OrderAssignment_shopId_fkey";
ALTER TABLE "OrderMetadata" DROP CONSTRAINT IF EXISTS "OrderMetadata_shopId_fkey";
ALTER TABLE "OrderMetadata" DROP CONSTRAINT IF EXISTS "OrderMetadata_assignedStaffId_fkey";
ALTER TABLE "ExportJob" DROP CONSTRAINT IF EXISTS "ExportJob_shopId_fkey";
ALTER TABLE "WebhookEvent" DROP CONSTRAINT IF EXISTS "WebhookEvent_shopId_fkey";

-- DropTables (order index, export jobs, webhook ledger)
DROP TABLE IF EXISTS "OrderMetadata";
DROP TABLE IF EXISTS "ExportJob";
DROP TABLE IF EXISTS "WebhookEvent";

-- DropEnums
DROP TYPE IF EXISTS "ExportJobStatus";
DROP TYPE IF EXISTS "WebhookStatus";

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN IF EXISTS "initialSyncEnqueuedAt";

-- CreateTable
CREATE TABLE "OrderOpsMeta" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "codStatus" "CodStatus" NOT NULL DEFAULT 'NOT_COD',
    "assignedStaffId" TEXT,
    "notesCount" INTEGER NOT NULL DEFAULT 0,
    "latestNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderOpsMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderOpsMeta_shopId_shopifyOrderId_key" ON "OrderOpsMeta"("shopId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "OrderOpsMeta_shopId_idx" ON "OrderOpsMeta"("shopId");

-- AddForeignKeys
ALTER TABLE "OrderOpsMeta" ADD CONSTRAINT "OrderOpsMeta_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderOpsMeta" ADD CONSTRAINT "OrderOpsMeta_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Re-add OrderAssignment FK (unchanged table, guarded above for idempotency)
ALTER TABLE "OrderAssignment" ADD CONSTRAINT "OrderAssignment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
