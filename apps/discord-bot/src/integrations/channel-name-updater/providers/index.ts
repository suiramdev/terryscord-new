import type { Client } from "discord.js";

import { fetchActiveGiveawayCount } from "./active-giveaways";
import { fetchDiscordServerStats } from "./discord-server";
import { fetchSteamPlayerCount } from "./steam-players";

export interface ValueProvider {
  description: string;
  fetchValues: (
    guildId: string,
    config: unknown | undefined,
    client: Client<true>
  ) => Promise<Record<string, string | number> | null>;
  providedKeys: string[];
  type: string;
}

const providers: ValueProvider[] = [
  {
    description: "Nombre de joueurs en ligne sur s&box (Steam)",
    async fetchValues() {
      const count = await fetchSteamPlayerCount();
      if (count === null) {
        return null;
      }

      return { count };
    },
    providedKeys: ["count"],
    type: "steam_players",
  },
  {
    description: "Nombre de giveaways en cours sur ce serveur",
    async fetchValues(guildId: string) {
      const count = await fetchActiveGiveawayCount(guildId);
      if (count === null) {
        return null;
      }

      return { count };
    },
    providedKeys: ["count"],
    type: "active_giveaways",
  },
  {
    description: "Statistiques du serveur Discord (membres, boosts, tier)",
    async fetchValues(
      guildId: string,
      _config: unknown | undefined,
      client: Client<true>
    ) {
      const stats = await fetchDiscordServerStats(client, guildId);
      if (stats === null) {
        return null;
      }

      return {
        boosts: stats.boosts as number,
        members: stats.members as number,
        tier: stats.tier as number,
      };
    },
    providedKeys: ["members", "boosts", "tier"],
    type: "discord_server",
  },
];

export const getValueProvider = (type: string): ValueProvider | undefined =>
  providers.find((p) => p.type === type);

export const listValueProviders = (): readonly ValueProvider[] => providers;
