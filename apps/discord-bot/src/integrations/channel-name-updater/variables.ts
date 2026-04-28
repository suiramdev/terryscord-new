import type { Client } from "discord.js";
import { log } from "evlog";

import { getActiveGiveaways } from "@/integrations/giveaway-persistence";

const STEAM_API_URL =
  "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=590830";

interface SteamApiResponse {
  response: {
    player_count: number;
    result: number;
  };
}

export interface VariableFetcher {
  description: string;
  fetch: (
    guildId: string,
    client: Client<true>
  ) => Promise<string | number | null>;
  key: string;
}

/* eslint-disable max-statements */
const fetchSteamPlayerCount = async (): Promise<number | null> => {
  try {
    const response = await fetch(STEAM_API_URL, {
      method: "GET",
    });

    if (!response.ok) {
      log.warn({
        message: "Steam API returned non-OK status",
        status: response.status,
        statusText: response.statusText,
      });

      return null;
    }

    const data = (await response.json()) as SteamApiResponse;
    const playerCount = data.response?.player_count;

    if (typeof playerCount !== "number") {
      log.warn({
        message: "Steam API response missing player_count",
        response: data,
      });

      return null;
    }

    return playerCount;
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to fetch Steam player count",
    });

    return null;
  }
};

const fetchActiveGiveawayCount = async (
  guildId: string
): Promise<number | null> => {
  try {
    const giveaways = await getActiveGiveaways({ guildId });
    return giveaways.length;
  } catch {
    return null;
  }
};

const fetchDiscordServerStats = async (
  guildId: string,
  client: Client<true>
): Promise<{ boosts: number; members: number; tier: number } | null> => {
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

const fetchers: VariableFetcher[] = [
  {
    description: "Nombre de joueurs en ligne sur s&box (Steam)",
    async fetch() {
      const value = await fetchSteamPlayerCount();
      return value;
    },
    key: "steam_players",
  },
  {
    description: "Nombre de giveaways en cours sur ce serveur",
    async fetch(guildId: string) {
      const value = await fetchActiveGiveawayCount(guildId);
      return value;
    },
    key: "active_giveaways",
  },
  {
    description: "Nombre total de membres sur ce serveur",
    async fetch(guildId: string, client: Client<true>) {
      const stats = await fetchDiscordServerStats(guildId, client);
      return stats?.members ?? null;
    },
    key: "discord_members",
  },
  {
    description: "Nombre de boosts sur ce serveur",
    async fetch(guildId: string, client: Client<true>) {
      const stats = await fetchDiscordServerStats(guildId, client);
      return stats?.boosts ?? null;
    },
    key: "discord_boosts",
  },
  {
    description: "Niveau de boost du serveur (0-3)",
    async fetch(guildId: string, client: Client<true>) {
      const stats = await fetchDiscordServerStats(guildId, client);
      return stats?.tier ?? null;
    },
    key: "discord_tier",
  },
];

const fetcherMap = new Map(fetchers.map((f) => [f.key, f]));

export const getVariableFetcher = (key: string): VariableFetcher | undefined =>
  fetcherMap.get(key);

export const listVariableFetchers = (): readonly VariableFetcher[] => fetchers;

export const getAllVariableKeys = (): string[] =>
  fetchers.map((fetcher) => fetcher.key);
