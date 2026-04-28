import { getActiveGiveaways } from "@/integrations/giveaway-persistence";

export const fetchActiveGiveawayCount = async (
  guildId: string
): Promise<number | null> => {
  try {
    const giveaways = await getActiveGiveaways({ guildId });
    return giveaways.length;
  } catch {
    return null;
  }
};
