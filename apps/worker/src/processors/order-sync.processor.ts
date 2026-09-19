import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { prisma } from "@order-operations/db";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type SyncShopOrdersJob,
} from "@order-operations/shared";
import { syncShopOrders } from "../services/order-sync";
import { getOfflineAccessToken } from "../services/session-lookup";

@Processor(QUEUE_NAMES.ORDER_SYNC)
export class OrderSyncProcessor extends WorkerHost {
  async process(job: Job<SyncShopOrdersJob>): Promise<void> {
    if (job.name !== JOB_NAMES.SYNC_SHOP_ORDERS) return;
    const { shopId, shopDomain, since } = job.data;
    const accessToken = await getOfflineAccessToken(shopDomain);
    const result = await syncShopOrders({ shopId, shopDomain, accessToken, since });
    console.log(
      `Order sync for ${shopDomain}: ${result.synced} orders over ${result.pages} pages`,
    );
  }
}
