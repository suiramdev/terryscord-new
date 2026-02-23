# terryscord

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Elysia, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Elysia** - Type-safe, high-performance framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Bun** - Runtime environment
- **Prisma** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Husky** - Git hooks for code quality
- **Oxlint** - Oxlint + Oxfmt (linting & formatting)
- **Turborepo** - Optimized monorepo build system
- **Discord Bot** - Bun + discord.js workspace with slash command architecture

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Discord Bot Setup

1. Create a bot env file from `apps/discord-bot/.env.example`.
2. Set `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID`.
3. (Recommended for development) set `DISCORD_GUILD_ID` for fast guild-scoped command registration.
4. Set `BOT_DATABASE_URL` (or `DATABASE_URL`) so captcha settings and verification can access Prisma.

Register slash commands and run the bot:

```bash
bun run bot:deploy-commands
bun run dev:bot
```

## Database Setup

This project uses PostgreSQL with Prisma.

1. Copy `packages/db/.env.example` to `packages/db/.env` and `apps/server/.env.example` to `apps/server/.env`.
2. (Optional) Set `DATABASE_PORT` in both files if `5432` is already used on your machine.
3. Start the database container:

```bash
bun run db:start
```

4. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## Git Hooks and Formatting

- Initialize hooks: `bun run prepare`
- Format and lint fix: `bun run check`

## Project Structure

```
terryscord/
├── apps/
│   ├── discord-bot/ # Discord bot service (commands, events, integrations)
│   ├── web/         # Frontend application (React + TanStack Start)
│   └── server/      # Backend API (Elysia, ORPC)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run dev:bot`: Start only the Discord bot
- `bun run bot:deploy-commands`: Register Discord slash commands
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Oxlint and Oxfmt

## Docker Deployment (All Apps)

Each app now has its own production Dockerfile:

- `apps/server/Dockerfile`
- `apps/web/Dockerfile`
- `apps/discord-bot/Dockerfile`

All Dockerfiles use Turborepo's `prune --docker` pattern:

- `out/json` - lockfile + package manifests (fast dependency install layer)
- `out/full` - only source files needed for the selected workspace build

You can inspect a pruned workspace locally (example):

```bash
bun x turbo prune server --docker
```

### Build Images

```bash
docker build -f apps/server/Dockerfile -t terryscord-server .
docker build -f apps/web/Dockerfile -t terryscord-web .
docker build -f apps/discord-bot/Dockerfile -t terryscord-discord-bot .
```

### Run Containers

Server:

```bash
docker run --rm -p 3000:3000 --env-file apps/server/.env terryscord-server
```

If `DATABASE_URL` points to `localhost`, update it for container networking (for example, `host.docker.internal` on macOS/Windows, or a Compose service name).

Web:

```bash
docker run --rm -p 3001:3001 --env-file apps/web/.env terryscord-web
```

Discord bot:

```bash
docker run --rm --env-file apps/discord-bot/.env terryscord-discord-bot
```

The bot is a worker process and does not expose an HTTP port.

### Enable Turborepo Remote Cache for Docker builds

Pass cache credentials when building any image:

```bash
docker build \
  -f apps/discord-bot/Dockerfile \
  -t terryscord-discord-bot \
  --build-arg TURBO_TEAM=your-team-slug \
  --build-arg TURBO_TOKEN=your-turbo-token \
  .
```

When `TURBO_TEAM` and `TURBO_TOKEN` are set, the builder stage can pull/push cached build artifacts, which speeds up repeated CI or local image builds.
