import { commands } from "@/commands";
import { registerApplicationCommands } from "@/discord/register-commands";
import { logger } from "@/logger";

const main = async (): Promise<void> => {
  await registerApplicationCommands(commands);
};

try {
  await main();
} catch (error: unknown) {
  logger.fatal({ err: error }, "Failed to register Discord slash commands");
  process.exit(1);
}
