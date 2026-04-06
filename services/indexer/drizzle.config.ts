import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/config/database.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://nexus:nexus@localhost:5432/nexus_indexer",
  },
});
