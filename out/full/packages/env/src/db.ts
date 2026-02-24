import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const resolveDatabaseUrl = ({
  connectionString,
  portFromEnv,
}: {
  connectionString: string;
  portFromEnv: number | undefined;
}): string => {
  if (portFromEnv === undefined) {
    return connectionString;
  }

  const parsedConnection = new URL(connectionString);
  parsedConnection.port = String(portFromEnv);
  return parsedConnection.toString();
};

const runtimeEnv = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BOT_DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    BOT_DATABASE_URL: z.string().min(1).optional(),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    DATABASE_URL: z.string().min(1).optional(),
  },
});

const databaseConnectionString =
  runtimeEnv.DATABASE_URL ?? runtimeEnv.BOT_DATABASE_URL;

if (!databaseConnectionString) {
  throw new Error(
    "Invalid environment variables: set DATABASE_URL or BOT_DATABASE_URL."
  );
}

const databasePort = runtimeEnv.DATABASE_PORT ?? runtimeEnv.BOT_DATABASE_PORT;

export const env = {
  ...runtimeEnv,
  DATABASE_URL: resolveDatabaseUrl({
    connectionString: databaseConnectionString,
    portFromEnv: databasePort,
  }),
} as const;
