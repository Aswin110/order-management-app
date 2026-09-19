import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "@order-operations/shared";
import { OrderSyncProcessor } from "./processors/order-sync.processor";
import { CsvExportProcessor } from "./processors/csv-export.processor";
import { BulkActionProcessor } from "./processors/bulk-action.processor";

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.ORDER_SYNC },
      { name: QUEUE_NAMES.CSV_EXPORT },
      { name: QUEUE_NAMES.BULK_ACTION },
    ),
  ],
  providers: [OrderSyncProcessor, CsvExportProcessor, BulkActionProcessor],
})
export class AppModule {}
