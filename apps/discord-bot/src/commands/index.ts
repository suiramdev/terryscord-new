import { helloCommand } from "./hello";
import type { SlashCommand } from "./types";

export const commands: readonly SlashCommand[] = [helloCommand];

export const commandRegistry: ReadonlyMap<string, SlashCommand> = new Map(
  commands.map((command) => [command.data.name, command])
);
