import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// Standalone NestJS application context: no HTTP listener, just the
// BullMQ queue consumers (order sync, CSV export, bulk actions).
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  app.enableShutdownHooks();
  console.log("Order Operations worker started");
}

bootstrap().catch((error) => {
  console.error("Worker failed to start", error);
  process.exit(1);
});
