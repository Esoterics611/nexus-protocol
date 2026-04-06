import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

// BigInt is not JSON-serializable by default. Drizzle returns bigint for
// columns declared with { mode: "bigint" } (blockNumber, reportedTimestamp, etc.).
// Patching toJSON here means all BigInts in API responses serialize as strings,
// which is safe — the frontend already casts them with Number() / BigInt().
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3001;

  app.enableCors({ origin: "*" }); // tighten in production

  await app.listen(port);
  Logger.log(`Nexus Indexer running on http://localhost:${port}`, "Bootstrap");
  Logger.log(`Health: http://localhost:${port}/health`, "Bootstrap");
  Logger.log(`API: http://localhost:${port}/api/indexer-status`, "Bootstrap");
}

bootstrap();
