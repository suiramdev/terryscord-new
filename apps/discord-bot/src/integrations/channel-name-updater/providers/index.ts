import { fetchActiveGiveawayCount } from "./active-giveaways";
import { fetchSteamPlayerCount } from "./steam-players";

export interface ValueProvider {
  description: string;
  fetchValues: (
    guildId: string,
    config?: unknown
  ) => Promise<Record<string, string | number> | null>;
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
    type: "active_giveaways",
  },
];

export const getValueProvider = (type: string): ValueProvider | undefined =>
  providers.find((p) => p.type === type);

export const listValueProviders = (): readonly ValueProvider[] => providers;
