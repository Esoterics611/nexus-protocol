import { Module, Global } from "@nestjs/common";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const DB_TOKEN = "DRIZZLE_DB";

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL not set");
        const sql = postgres(url, { max: 10 });
        return drizzle(sql);
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}
