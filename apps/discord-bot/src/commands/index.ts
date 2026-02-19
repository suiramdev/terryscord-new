import { captchaCommand } from "./captcha";
import { deleteCategoryChannelsCommand } from "./delete-category-channels";
import { helloCommand } from "./hello";
import type { SlashCommand } from "./types";

export const commands: readonly SlashCommand[] = [
  captchaCommand,
  deleteCategoryChannelsCommand,
  helloCommand,
];

export const commandRegistry: ReadonlyMap<string, SlashCommand> = new Map(
  commands.map((command) => [command.data.name, command])
);
