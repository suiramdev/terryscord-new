import { env } from "@terryscord/env/bot";
import type { LoggerConfig, SamplingRates } from "evlog";

const samplingRatesByLevel: Record<
  "fatal" | "error" | "warn" | "info" | "debug" | "trace",
  SamplingRates
> = {
  debug: {
    debug: 100,
    error: 100,
    info: 100,
    warn: 100,
  },
  error: {
    debug: 0,
    error: 100,
    info: 0,
    warn: 0,
  },
  fatal: {
    debug: 0,
    error: 100,
    info: 0,
    warn: 0,
  },
  info: {
    debug: 0,
    error: 100,
    info: 100,
    warn: 100,
  },
  trace: {
    debug: 100,
    error: 100,
    info: 100,
    warn: 100,
  },
  warn: {
    debug: 0,
    error: 100,
    info: 0,
    warn: 100,
  },
};

export const evlogConfig: LoggerConfig = {
  env: {
    environment: env.NODE_ENV,
    service: "discord-bot",
  },
  pretty: env.NODE_ENV !== "production",
  sampling: {
    rates: samplingRatesByLevel[env.DISCORD_LOG_LEVEL],
  },
};
