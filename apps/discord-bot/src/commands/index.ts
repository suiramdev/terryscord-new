import { captchaCommand } from "./captcha";
import { deleteCategoryChannelsCommand } from "./delete-category-channels";
import { embedCommand } from "./embed";
import { giveawayCommand } from "./giveaway";
import { helloCommand } from "./hello";
import { rolePickButtonCommand } from "./role-pick-button";
import { rssCommand } from "./rss";
import type { SlashCommand } from "./types";

export const commands: readonly SlashCommand[] = [
  captchaCommand,
  deleteCategoryChannelsCommand,
  embedCommand,
  giveawayCommand,
  helloCommand,
  rssCommand,
  rolePickButtonCommand,
];

export const commandRegistry: ReadonlyMap<string, SlashCommand> = new Map(
  commands.map((command) => [command.data.name, command])
);
