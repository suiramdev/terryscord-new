import type { Client } from "discord.js";

import { logger } from "@/logger";

export const handleReady = async (
  client: Client<true>,
  onReady?: () => Promise<void>
): Promise<void> => {
  logger.info(
    {
      userId: client.user.id,
      userTag: client.user.tag,
    },
    "Discord bot connected"
  );

  if (onReady) {
    await onReady();
  }
};
