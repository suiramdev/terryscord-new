import type { Client } from "discord.js";

export const fetchDiscordServerStats = async (
  client: Client<true>,
  guildId: string
): Promise<Record<string, number> | null> => {
  const guild =
    client.guilds.cache.get(guildId) ??
    (await client.guilds.fetch(guildId).catch(() => null));

  if (!guild) {
    return null;
  }

  return {
    boosts: guild.premiumSubscriptionCount ?? 0,
    members: guild.memberCount ?? 0,
    tier: guild.premiumTier ?? 0,
  };
};
