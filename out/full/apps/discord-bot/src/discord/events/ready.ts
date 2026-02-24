import type { Client } from "discord.js";
import { log } from "evlog";

export const handleReady = async (
  client: Client<true>,
  onReady?: () => Promise<void>
): Promise<void> => {
  log.info({
    guildCount: client.guilds.cache.size,
    message: "Discord bot connected",
    userId: client.user.id,
    userTag: client.user.tag,
  });

  if (onReady) {
    log.debug({ message: "Running Discord ready callback" });
    await onReady();
    log.debug({ message: "Completed Discord ready callback" });
  }
};
