import { EmbedBuilder } from "discord.js";
import type { GuildMember } from "discord.js";

// "important" tone color
const GIVEAWAY_EMBED_COLOR = 16_709_120;

const getRandomUint32 = (): number => {
  const buffer = new Uint32Array(1);
  const webCrypto = globalThis.crypto;

  if (!webCrypto) {
    throw new Error("Web Crypto API not available");
  }

  webCrypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
};

const secureShuffle = <T>(array: readonly T[]): T[] => {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = getRandomUint32() % (i + 1);
    const temp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = temp;
  }

  return arr;
};

export const selectWinners = ({
  participantUserIds,
  winnerCount,
}: {
  participantUserIds: readonly string[];
  winnerCount: number;
}): { shortfall: boolean; winners: string[] } => {
  const boundedWinnerCount = Math.max(
    1,
    Math.min(winnerCount, participantUserIds.length)
  );
  const shuffled = secureShuffle(participantUserIds);

  return {
    shortfall: participantUserIds.length < winnerCount,
    winners: shuffled.slice(0, boundedWinnerCount),
  };
};

export const validateEligible = ({
  member,
  requiredRoleIds,
}: {
  member: GuildMember;
  requiredRoleIds: readonly string[];
}): boolean => {
  if (requiredRoleIds.length === 0) {
    return true;
  }

  return requiredRoleIds.some((roleId) => member.roles.cache.has(roleId));
};

export const formatGiveawayEmbed = ({
  description,
  endsAt,
  participantCount,
  prize,
  requiredRoleIds,
  winnerCount,
}: {
  description: string | null;
  endsAt: Date;
  participantCount: number;
  prize: string;
  requiredRoleIds: readonly string[];
  winnerCount: number;
}): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setColor(GIVEAWAY_EMBED_COLOR)
    .setTitle("🎉 Giveaway")
    .addFields(
      { inline: false, name: "Lot", value: prize },
      {
        inline: true,
        name: "Gagnants",
        value: String(winnerCount),
      },
      {
        inline: true,
        name: "Participants",
        value: String(participantCount),
      },
      {
        inline: false,
        name: "Se termine",
        value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
      }
    );

  if (description) {
    embed.setDescription(description);
  }

  if (requiredRoleIds.length > 0) {
    const roleMentions = requiredRoleIds.map((id) => `<@&${id}>`).join(", ");
    embed.addFields({
      inline: false,
      name: "Rôle(s) requis",
      value: roleMentions,
    });
  }

  return embed;
};

export const formatGiveawayEndedEmbed = ({
  description,
  endedAt,
  participantCount,
  prize,
  requiredRoleIds,
  winners,
}: {
  description: string | null;
  endedAt: Date;
  participantCount: number;
  prize: string;
  requiredRoleIds: readonly string[];
  winnerCount: number;
  winners: readonly string[];
}): EmbedBuilder => {
  const embed = new EmbedBuilder()
    // "success" tone color
    .setColor(5_765_713)
    .setTitle("🎉 Giveaway (terminé)")
    .addFields(
      { inline: false, name: "Lot", value: prize },
      {
        inline: true,
        name: "Gagnants",
        value:
          winners.length > 0
            ? winners.map((id) => `<@${id}>`).join(", ")
            : "Aucun",
      },
      {
        inline: true,
        name: "Participants",
        value: String(participantCount),
      },
      {
        inline: false,
        name: "Terminé",
        value: `<t:${Math.floor(endedAt.getTime() / 1000)}:R>`,
      }
    );

  if (description) {
    embed.setDescription(description);
  }

  if (requiredRoleIds.length > 0) {
    const roleMentions = requiredRoleIds.map((id) => `<@&${id}>`).join(", ");
    embed.addFields({
      inline: false,
      name: "Rôle(s) requis",
      value: roleMentions,
    });
  }

  return embed;
};

export const createWinnerDmEmbed = ({
  guildName,
  prize,
}: {
  guildName: string;
  prize: string;
}): EmbedBuilder =>
  new EmbedBuilder()
    .setColor(5_765_713)
    .setTitle("Félicitations !")
    .setDescription(
      `Vous avez gagné **${prize}** sur le serveur **${guildName}**. Un administrateur vous contactera sous peu pour vous remettre votre lot.`
    );
