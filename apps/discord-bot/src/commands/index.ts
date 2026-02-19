import { env } from "@terryscord/env/bot";

import { captchaCommand } from "./captcha";
import { debugCaptchaCommand } from "./debugcaptcha";
import { helloCommand } from "./hello";
import type { SlashCommand } from "./types";

const debugCommands: readonly SlashCommand[] =
  env.NODE_ENV === "development" ? [debugCaptchaCommand] : [];

export const commands: readonly SlashCommand[] = [
  captchaCommand,
  helloCommand,
  ...debugCommands,
];

export const commandRegistry: ReadonlyMap<string, SlashCommand> = new Map(
  commands.map((command) => [command.data.name, command])
);
