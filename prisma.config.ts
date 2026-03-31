import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const prismaDatabaseUrl = process.env.PRISMA_DATABASE_URL?.trim();
const directDatabaseUrl = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();
const fallbackCliUrl = "postgresql://prisma:prisma@127.0.0.1:5432/prisma";

const isAccelerateUrl = Boolean(
  prismaDatabaseUrl
  && (prismaDatabaseUrl.startsWith("prisma://") || prismaDatabaseUrl.startsWith("prisma+postgres://")),
);

const migrationUrl = directDatabaseUrl || (!isAccelerateUrl ? prismaDatabaseUrl : undefined);

if (!migrationUrl) {
  console.warn(
    "Prisma CLI is running without a database URL. Falling back to a local placeholder datasource for code generation only.",
  );
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: migrationUrl ?? fallbackCliUrl,
  },
});
