import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { prisma } from "@order-operations/db";
import { buildOrderWhere, buildOrderBy } from "@order-operations/shared/order-query";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  CSV_HEADERS,
  orderToCsvRow,
  orderFiltersSchema,
  sortSchema,
  type GenerateCsvJob,
  type OrderSort,
  type OrderFilters,
} from "@order-operations/shared";

const EXPORT_PAGE_SIZE = 500;

@Processor(QUEUE_NAMES.CSV_EXPORT)
export class CsvExportProcessor extends WorkerHost {
  async process(job: Job<GenerateCsvJob>): Promise<void> {
    if (job.name !== JOB_NAMES.GENERATE_CSV) return;
    const { exportJobId, shopId } = job.data;

    const exportJob = await prisma.exportJob.findFirst({
      where: { id: exportJobId, shopId },
    });
    if (!exportJob) throw new Error(`Export job ${exportJobId} not found`);

    await prisma.exportJob.update({
      where: { id: exportJob.id },
      data: { status: "PROCESSING" },
    });

    try {
      const settings = await prisma.shopSettings.findUnique({ where: { shopId } });
      const payload = exportJob.filters as { filters?: unknown; sort?: unknown };
      const filters: OrderFilters = orderFiltersSchema.parse(payload.filters ?? {});
      const sort: OrderSort = sortSchema.parse(payload.sort ?? {});
      const where = buildOrderWhere(
        shopId,
        filters,
        settings?.highValueThreshold ?? 5000,
      );
      const orderBy = buildOrderBy(sort);

      const exportDir = process.env.EXPORT_DIR || path.join(process.cwd(), "exports");
      await fs.mkdir(exportDir, { recursive: true });
      const filePath = path.join(exportDir, `orders-${exportJob.id}.csv`);
      const file = await fs.open(filePath, "w");
      let rowCount = 0;

      try {
        await file.write(CSV_HEADERS.join(",") + "\n");
        // Page through matches; never buffer the whole table in memory.
        let cursor: string | undefined;
        for (;;) {
          const page = await prisma.orderMetadata.findMany({
            where,
            orderBy,
            take: EXPORT_PAGE_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: { assignedStaff: { select: { name: true } } },
          });
          if (!page.length) break;
          await file.write(page.map((o) => orderToCsvRow(o)).join("\n") + "\n");
          rowCount += page.length;
          cursor = page[page.length - 1]?.id;
          if (page.length < EXPORT_PAGE_SIZE) break;
        }
      } finally {
        await file.close();
      }

      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: { status: "COMPLETED", filePath, rowCount, completedAt: new Date() },
      });
      console.log(`CSV export ${exportJob.id}: ${rowCount} rows -> ${filePath}`);
    } catch (error) {
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        },
      });
      throw error;
    }
  }
}
