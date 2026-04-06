import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3002;

  app.enableCors({ origin: "*" }); // tighten in production

  await app.listen(port);
  Logger.log(`Nexus Oracle Reporter running on http://localhost:${port}`, "Bootstrap");
  Logger.log(`Health: http://localhost:${port}/health`, "Bootstrap");
}

bootstrap();
