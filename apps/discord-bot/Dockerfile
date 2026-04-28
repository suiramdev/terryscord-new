# syntax=docker/dockerfile:1.7

# Use Debian-based Bun image for better native module compatibility.
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Create a minimal monorepo snapshot for the discord-bot workspace.
FROM base AS pruner
COPY . .
RUN test -f turbo.json || (echo "ERROR: Docker build context must be the monorepo root (.) so turbo prune can resolve workspaces." && exit 1)
RUN bun x turbo@^2 prune discord-bot --docker

# Install dependencies from the pruned package manifests only.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

# Build the bot (and needed workspace dependencies) with Turbo.
FROM installer AS builder
COPY --from=pruner /app/out/full/ .

# Optional remote cache credentials.
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN
ARG DATABASE_URL=postgresql://postgres:password@localhost:5432/terryscord
ENV DATABASE_URL=$DATABASE_URL

RUN bun run --cwd packages/db db:generate
RUN bun x turbo run build --filter=discord-bot...

# Prune dev dependencies while keeping built production artifacts.
FROM installer AS production-deps
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install runtime font dependencies for captcha-canvas/skia-canvas text rendering.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
  fontconfig \
  fonts-dejavu-core \
  fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=bun:bun --from=production-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=production-deps /app/apps/discord-bot/node_modules ./apps/discord-bot/node_modules
COPY --chown=bun:bun --from=production-deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --chown=bun:bun --from=builder /app/apps/discord-bot/package.json ./apps/discord-bot/package.json
COPY --chown=bun:bun --from=builder /app/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --chown=bun:bun --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --chown=bun:bun --from=builder /app/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
COPY --chown=bun:bun --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --chown=bun:bun docker/run-with-migrations.sh ./docker/run-with-migrations.sh

USER bun
WORKDIR /app/apps/discord-bot
ENTRYPOINT ["sh", "/app/docker/run-with-migrations.sh"]
CMD ["bun", "dist/index.mjs"]
