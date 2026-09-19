import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type SyncShopOrdersJob,
  type GenerateCsvJob,
  type ApplyBulkActionJob,
} from "@order-operations/shared";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

let queues: {
  orderSync: Queue<SyncShopOrdersJob>;
  csvExport: Queue<GenerateCsvJob>;
  bulkAction: Queue<ApplyBulkActionJob>;
} | null = null;

export function getQueues() {
  if (!queues) {
    queues = {
      orderSync: new Queue<SyncShopOrdersJob>(QUEUE_NAMES.ORDER_SYNC, { connection }),
      csvExport: new Queue<GenerateCsvJob>(QUEUE_NAMES.CSV_EXPORT, { connection }),
      bulkAction: new Queue<ApplyBulkActionJob>(QUEUE_NAMES.BULK_ACTION, { connection }),
    };
  }
  return queues;
}

export async function enqueueOrderSync(job: SyncShopOrdersJob) {
  return getQueues().orderSync.add(JOB_NAMES.SYNC_SHOP_ORDERS, job, {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function enqueueCsvExport(job: GenerateCsvJob) {
  return getQueues().csvExport.add(JOB_NAMES.GENERATE_CSV, job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function enqueueBulkAction(job: ApplyBulkActionJob) {
  return getQueues().bulkAction.add(JOB_NAMES.APPLY_BULK_ACTION, job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
