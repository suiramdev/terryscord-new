import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const getDatabaseUrl = (
  connectionString: string,
  portFromEnv: string | undefined
): string => {
  if (!portFromEnv) {
    return connectionString;
  }

  const port = Number.parseInt(portFromEnv, 10);
  if (Number.isNaN(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535.");
  }

  const parsedConnection = new URL(connectionString);
  parsedConnection.port = portFromEnv;
  return parsedConnection.toString();
};

export default defineConfig({
  datasource: {
    url: getDatabaseUrl(env("DATABASE_URL"), process.env.DATABASE_PORT),
  },
  migrations: {
    path: "prisma/migrations",
  },
  schema: "prisma/schema",
});
