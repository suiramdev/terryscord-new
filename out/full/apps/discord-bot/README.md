# Discord Bot (`apps/discord-bot`)

A Bun + discord.js bot workspace designed for scalable command-driven development.

## Features

- Structured command registry (`src/commands`)
- Central event wiring (`src/discord/events`)
- Slash command deployment script (`src/scripts/register-commands.ts`)
- Runtime env validation through `@terryscord/env/bot`
- Optional startup health checks for oRPC (`@terryscord/api`) and Prisma (`@terryscord/db`)

## Run

```bash
# Re-synces slash commands (clears old guild/global commands, then registers current set)
bun run bot:deploy-commands
bun run dev:bot
```

## Architecture

- `src/index.ts`: process bootstrap, client startup, graceful shutdown
- `src/commands`: slash command definitions and registry
- `src/discord`: Discord client and command registration logic
- `src/integrations`: optional cross-service health checks and integration stubs
- `src/scripts`: operational scripts (manual command deployment)
