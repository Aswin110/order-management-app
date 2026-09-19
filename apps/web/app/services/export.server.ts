import prisma from "../db.server";
import type { OrderFilters, OrderSort } from "@order-operations/shared";
import { enqueueCsvExport } from "./queues.server";

/** Creates an ExportJob and queues CSV generation in the worker. */
export async function requestCsvExport(options: {
  shopId: string;
  filters: OrderFilters;
  sort: OrderSort;
}) {
  const job = await prisma.exportJob.create({
    data: {
      shopId: options.shopId,
      filters: { filters: options.filters, sort: options.sort },
    },
  });
  await enqueueCsvExport({ exportJobId: job.id, shopId: options.shopId });
  return job;
}

export async function getExportJob(shopId: string, jobId: string) {
  return prisma.exportJob.findFirst({ where: { id: jobId, shopId } });
}

export async function listExportJobs(shopId: string, limit = 20) {
  return prisma.exportJob.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
