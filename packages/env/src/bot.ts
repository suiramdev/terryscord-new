import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BOT_DATABASE_HEALTHCHECK_ON_READY: booleanFlag,
    BOT_RPC_HEALTHCHECK_ON_READY: booleanFlag,
    BOT_SERVER_RPC_URL: z.url().optional(),
    DISCORD_BOT_LOCALE: z.enum(["fr"]).default("fr"),
    DISCORD_BOT_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1).optional(),
    DISCORD_LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    DISCORD_RSS_FETCH_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60_000)
      .default(10_000),
    DISCORD_RSS_MAX_ITEMS_PER_POLL: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    DISCORD_RSS_POLL_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(300),
    DISCORD_RSS_POST_DELAY_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(30_000)
      .default(1000),
    DISCORD_SYNC_COMMANDS_ON_BOOT: booleanFlag,
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
});
