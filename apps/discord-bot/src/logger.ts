import { env } from "@terryscord/env/bot";
import pino from "pino";

const baseOptions = {
  level: env.DISCORD_LOG_LEVEL,
  name: "discord-bot",
};

const isProduction = env.NODE_ENV === "production";

export const logger = isProduction
  ? pino({
      ...baseOptions,
      timestamp: pino.stdTimeFunctions.isoTime,
    })
  : pino(
      baseOptions,
      pino.transport({
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss",
        },
        target: "pino-pretty",
      })
    );
