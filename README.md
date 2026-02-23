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

## Docker Deployment (Server Workspace)

This repo includes a production Dockerfile at `apps/server/Dockerfile` that follows Turborepo's `prune --docker` pattern.

### 1) Create a pruned monorepo

You can run this locally to inspect what Docker will use:

```bash
bun x turbo prune server --docker
```

This writes:

- `out/json` - only `package.json` files and lockfile for fast dependency install layers
- `out/full` - source files needed to build the `server` workspace

### 2) Build an optimized image

Build from the repo root:

```bash
docker build -f apps/server/Dockerfile -t terryscord-server .
```

The Dockerfile uses multi-stage builds:

- `pruner`: runs `turbo prune server --docker`
- `installer`: installs dependencies from `out/json`
- `builder`: runs `turbo run build --filter=server...`
- `runner`: copies production dependencies + built server output only

Run the container:

```bash
docker run --rm -p 3000:3000 --env-file apps/server/.env terryscord-server
```

If `DATABASE_URL` points to `localhost`, update it for container networking (for example, `host.docker.internal` on macOS/Windows, or a Compose service name).

### 3) Enable Turborepo Remote Cache for Docker builds

Pass cache credentials at build time:

```bash
docker build \
  -f apps/server/Dockerfile \
  -t terryscord-server \
  --build-arg TURBO_TEAM=your-team-slug \
  --build-arg TURBO_TOKEN=your-turbo-token \
  .
```

When `TURBO_TEAM` and `TURBO_TOKEN` are set, the `builder` stage can pull/push cached build artifacts, which speeds up repeated CI or local image builds.
