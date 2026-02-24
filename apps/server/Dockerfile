# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app

# Create a minimal monorepo snapshot for the server workspace.
FROM base AS pruner
COPY . .
RUN test -f turbo.json || (echo "ERROR: Docker build context must be the monorepo root (.) so turbo prune can resolve workspaces." && exit 1)
RUN bun x turbo@^2 prune server --docker

# Install dependencies from the pruned package manifests only.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

# Build the server (and needed workspace dependencies) with Turbo.
FROM installer AS builder
COPY --from=pruner /app/out/full/ .

# Optional remote cache credentials.
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN

RUN bun x turbo run build --filter=server...

# Install production-only dependencies for a smaller runtime image.
FROM base AS production-deps
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist

USER bun
EXPOSE 3000
WORKDIR /app/apps/server
CMD ["bun", "dist/index.mjs"]
