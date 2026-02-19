import { env } from "@terryscord/env/bot";
import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
} from "discord.js";

import { triggerCaptchaVerificationForMember } from "@/discord/events/guild-member-add";
import { logger } from "@/logger";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;

interface ContextError {
  message: string;
  type: "error";
}

interface DebugContext {
  guild: Guild;
  targetMember: GuildMember;
  type: "success";
}

type DebugContextResult = ContextError | DebugContext;

const createContextError = (message: string): ContextError => ({
  message,
  type: "error",
});

const replyEphemeral = async ({
  content,
  interaction,
}: {
  content: string;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
  const payload = {
    content,
    flags: MessageFlags.Ephemeral as const,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
};

const resolveGuildMember = async ({
  guild,
  userId,
}: {
  guild: Guild;
  userId: string;
}): Promise<GuildMember | null> => {
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) {
    return cachedMember;
  }

  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
};

const isDeveloperAllowed = ({ member }: { member: GuildMember }): boolean => {
  const developerRoleId = env.BOT_DEBUG_CAPTCHA_DEVELOPER_ROLE_ID;
  if (!developerRoleId) {
    return false;
  }

  return member.roles.cache.has(developerRoleId);
};

const hasDebugCaptchaPermission = ({
  interaction,
  member,
}: {
  interaction: ChatInputCommandInteraction;
  member: GuildMember;
}): boolean => {
  if (interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return true;
  }

  return isDeveloperAllowed({ member });
};

const resolveGuildForDebug = (
  interaction: ChatInputCommandInteraction
): ContextError | Guild => {
  if (env.NODE_ENV !== "development") {
    return createContextError(
      "`/debugcaptcha` is disabled outside development mode to avoid accidental production use."
    );
  }

  if (!interaction.guild) {
    return createContextError("This command can only be used inside a server.");
  }

  return interaction.guild;
};

const resolveInvokingMemberForDebug = async ({
  guild,
  interaction,
}: {
  guild: Guild;
  interaction: ChatInputCommandInteraction;
}): Promise<ContextError | GuildMember> => {
  const invokingMember = await resolveGuildMember({
    guild,
    userId: interaction.user.id,
  });
  if (!invokingMember) {
    return createContextError("Unable to resolve your guild member profile.");
  }

  if (!hasDebugCaptchaPermission({ interaction, member: invokingMember })) {
    return createContextError(
      "You must be an administrator or have the configured developer debug role to use `/debugcaptcha`."
    );
  }

  return invokingMember;
};

const resolveTargetMemberForDebug = async ({
  guild,
  interaction,
}: {
  guild: Guild;
  interaction: ChatInputCommandInteraction;
}): Promise<ContextError | GuildMember> => {
  const targetUser = interaction.options.getUser("member") ?? interaction.user;
  const targetMember = await resolveGuildMember({
    guild,
    userId: targetUser.id,
  });
  if (!targetMember) {
    return createContextError("Target user is not a member of this guild.");
  }

  return targetMember;
};

const resolveDebugContext = async (
  interaction: ChatInputCommandInteraction
): Promise<DebugContextResult> => {
  const guild = resolveGuildForDebug(interaction);
  if ("type" in guild) {
    return guild;
  }

  const invokingMember = await resolveInvokingMemberForDebug({
    guild,
    interaction,
  });
  if ("type" in invokingMember) {
    return invokingMember;
  }

  const targetMember = await resolveTargetMemberForDebug({
    guild,
    interaction,
  });
  if ("type" in targetMember) {
    return targetMember;
  }

  return {
    guild,
    targetMember,
    type: "success",
  };
};

export const debugCaptchaCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("debugcaptcha")
    .setDescription(
      "Development-only: trigger full captcha verification workflow"
    )
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription(
          "Member to run captcha verification for (defaults to yourself)"
        )
        .setRequired(false)
    ),
  async execute(interaction): Promise<void> {
    const context = await resolveDebugContext(interaction);
    if (context.type === "error") {
      await replyEphemeral({
        content: context.message,
        interaction,
      });
      return;
    }

    logger.info(
      {
        guildId: context.guild.id,
        invokerId: interaction.user.id,
        targetId: context.targetMember.id,
      },
      "Debug captcha command invoked"
    );

    const started = triggerCaptchaVerificationForMember({
      member: context.targetMember,
      source: "debug",
    });

    if (!started) {
      await replyEphemeral({
        content:
          "Could not start verification. A captcha session is already active for that member.",
        interaction,
      });
      return;
    }

    await replyEphemeral({
      content: `Started full captcha verification workflow for <@${context.targetMember.id}>.`,
      interaction,
    });
  },
};
