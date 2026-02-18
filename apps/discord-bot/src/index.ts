import { env } from "@terryscord/env/bot";

import { commands } from "./commands";
import { createDiscordClient } from "./discord/client";
import { registerEventHandlers } from "./discord/events";
import { registerApplicationCommands } from "./discord/register-commands";
import { runStartupChecks } from "./integrations/startup";
import { logger } from "./logger";

const startBot = async (): Promise<void> => {
  const client = createDiscordClient();
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "Shutting down Discord bot");

    client.destroy();
    process.exit(0);
  };

  registerEventHandlers({
    client,
    onReady: async () => {
      if (env.DISCORD_SYNC_COMMANDS_ON_BOOT) {
        await registerApplicationCommands(commands);
      }

      await runStartupChecks();
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      shutdown(signal);
    });
  }

  logger.info("Starting Discord bot");
  await client.login(env.DISCORD_BOT_TOKEN);
};

try {
  await startBot();
} catch (error: unknown) {
  logger.fatal({ err: error }, "Failed to start Discord bot");
  process.exit(1);
}
