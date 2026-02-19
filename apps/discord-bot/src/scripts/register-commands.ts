import { initLogger, log } from "evlog";

import { commands } from "@/commands";
import { registerApplicationCommands } from "@/discord/register-commands";
import { evlogConfig } from "@/logging";

const main = async (): Promise<void> => {
  initLogger(evlogConfig);
  await registerApplicationCommands(commands);
};

try {
  await main();
} catch (error: unknown) {
  log.error({
    err: error,
    message: "Failed to register Discord slash commands",
    severity: "fatal",
  });
  process.exit(1);
}
