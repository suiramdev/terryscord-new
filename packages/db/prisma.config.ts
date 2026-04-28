import "dotenv/config";
import { defineConfig } from "prisma/config";

const getDatabaseUrl = (
  connectionString: string,
  portFromEnv: string | undefined
): string => {
  if (!portFromEnv) {
    return connectionString;
  }

  const port = Number.parseInt(portFromEnv, 10);
  if (Number.isNaN(port) || port < 1 || port > 65_535) {
    throw new Error(
      "DATABASE_PORT or BOT_DATABASE_PORT must be an integer between 1 and 65535."
    );
  }

  const parsedConnection = new URL(connectionString);
  parsedConnection.port = portFromEnv;
  return parsedConnection.toString();
};

const getRequiredDatabaseUrl = (): string => {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.BOT_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Invalid environment variables: set DATABASE_URL or BOT_DATABASE_URL."
    );
  }

  return getDatabaseUrl(
    connectionString,
    process.env.DATABASE_PORT ?? process.env.BOT_DATABASE_PORT
  );
};

export default defineConfig({
  datasource: {
    url: getRequiredDatabaseUrl(),
  },
  migrations: {
    path: "prisma/migrations",
  },
  schema: "prisma/schema",
});
