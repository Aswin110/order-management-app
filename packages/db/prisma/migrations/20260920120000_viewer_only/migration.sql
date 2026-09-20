-- Reduce the app to a pure order viewer.
-- Order state (notes, COD verification, staff assignment) is dropped: Shopify
-- is the only source of truth for orders. What remains is the OAuth session
-- plus each shop's viewing preferences.

-- DropForeignKey
ALTER TABLE "OrderAssignment" DROP CONSTRAINT IF EXISTS "OrderAssignment_shopId_fkey";
ALTER TABLE "OrderAssignment" DROP CONSTRAINT IF EXISTS "OrderAssignment_staffId_fkey";
ALTER TABLE "OrderNote" DROP CONSTRAINT IF EXISTS "OrderNote_shopId_fkey";
ALTER TABLE "OrderNote" DROP CONSTRAINT IF EXISTS "OrderNote_authorId_fkey";
ALTER TABLE "OrderOpsMeta" DROP CONSTRAINT IF EXISTS "OrderOpsMeta_shopId_fkey";
ALTER TABLE "OrderOpsMeta" DROP CONSTRAINT IF EXISTS "OrderOpsMeta_assignedStaffId_fkey";
ALTER TABLE "Staff" DROP CONSTRAINT IF EXISTS "Staff_shopId_fkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_shopId_fkey";

-- DropTable
DROP TABLE IF EXISTS "OrderAssignment";
DROP TABLE IF EXISTS "OrderNote";
DROP TABLE IF EXISTS "OrderOpsMeta";
DROP TABLE IF EXISTS "Staff";
DROP TABLE IF EXISTS "User";

-- AlterTable: settings for features that no longer exist.
-- These run before DROP TYPE: "defaultCodStatus" still depends on "CodStatus".
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "codEnabled";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "defaultCodStatus";
ALTER TABLE "ShopSettings" DROP COLUMN IF EXISTS "highValueThreshold";

-- DropEnum
DROP TYPE IF EXISTS "CodStatus";
