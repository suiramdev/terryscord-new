import { env } from "@terryscord/env/bot";
import { REST, Routes } from "discord.js";

import type { SlashCommand } from "@/commands/types";
import { logger } from "@/logger";

type CommandScope = "global" | "guild";

interface SyncScopeOptions {
  guildId?: string;
  payload: ReturnType<SlashCommand["data"]["toJSON"]>[];
  rest: REST;
  route: `/${string}`;
  scope: CommandScope;
}

const resyncCommandsForScope = async ({
  guildId,
  payload,
  rest,
  route,
  scope,
}: SyncScopeOptions): Promise<void> => {
  await rest.put(route, { body: [] });

  logger.info(
    {
      commandCount: 0,
      guildId,
      scope,
    },
    "Cleared Discord slash commands"
  );

  await rest.put(route, { body: payload });

  logger.info(
    {
      commandCount: payload.length,
      guildId,
      scope,
    },
    "Re-synced Discord slash commands"
  );
};

export const registerApplicationCommands = async (
  commands: readonly SlashCommand[]
): Promise<void> => {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  const payload = commands.map((command) => command.data.toJSON());

  if (env.DISCORD_GUILD_ID) {
    await resyncCommandsForScope({
      guildId: env.DISCORD_GUILD_ID,
      payload,
      rest,
      route: Routes.applicationGuildCommands(
        env.DISCORD_CLIENT_ID,
        env.DISCORD_GUILD_ID
      ),
      scope: "guild",
    });
  }

  await resyncCommandsForScope({
    payload,
    rest,
    route: Routes.applicationCommands(env.DISCORD_CLIENT_ID),
    scope: "global",
  });
};
