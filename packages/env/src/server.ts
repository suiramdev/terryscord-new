import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const resolveDatabaseUrl = (
  connectionString: string,
  portFromEnv: number | undefined
): string => {
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
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
});

export const env = {
  ...runtimeEnv,
  DATABASE_URL: resolveDatabaseUrl(
    runtimeEnv.DATABASE_URL,
    runtimeEnv.DATABASE_PORT
  ),
} as const;
