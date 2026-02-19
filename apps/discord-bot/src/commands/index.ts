import { captchaCommand } from "./captcha";
import { helloCommand } from "./hello";
import type { SlashCommand } from "./types";

export const commands: readonly SlashCommand[] = [captchaCommand, helloCommand];

export const commandRegistry: ReadonlyMap<string, SlashCommand> = new Map(
  commands.map((command) => [command.data.name, command])
);
