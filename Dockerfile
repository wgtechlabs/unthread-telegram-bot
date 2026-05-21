# =============================================================================
# UNTHREAD TELEGRAM BOT - DOCKERFILE
# =============================================================================
# Multi-stage Docker build for the Unthread Telegram Bot
# 
# Build stages:
# 1. base         - Minimal Node.js + dumb-init runtime base (no Bun)
# 2. builder-base - base + Bun (used only for dependency install & build)
# 3. deps         - Install production dependencies only
# 4. build        - Install dev dependencies and build the application
# 5. final        - Create minimal runtime image with built app (no Bun)
#
# Usage:
#   docker build -t unthread-telegram-bot .
#   docker run --env-file .env unthread-telegram-bot
# =============================================================================

# syntax=docker/dockerfile:1

# Use Node.js 26 latest Alpine line for primary runtime support
ARG NODE_VERSION=26-alpine
# Pinned Bun version for reproducible builds
ARG BUN_VERSION=1.3.13

# =============================================================================
# STAGE 1: Base Image
# =============================================================================
# Alpine-based Node image for minimal size and regular security updates.
# Intentionally kept minimal (no Bun) so the final runtime image stays small —
# Bun is only added on top in the `builder-base` stage used for install/build.
FROM node:${NODE_VERSION} AS base

# Install security updates for Alpine packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Set working directory for all subsequent stages
WORKDIR /usr/src/app

# =============================================================================
# STAGE 1b: Builder Base (base + Bun)
# =============================================================================
# Bun is installed here for dependency management and building only — the
# final runtime launches the bot with Node.js and does NOT include Bun.
FROM base AS builder-base
ARG BUN_VERSION
RUN npm install -g bun@${BUN_VERSION}

# =============================================================================
# STAGE 2: Production Dependencies
# =============================================================================
# Install only production dependencies for runtime
FROM builder-base AS deps

# Use bind mounts and cache for faster builds
# Downloads dependencies without copying package files into the layer
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile

# =============================================================================
# STAGE 3: Build Application  
# =============================================================================
# Install dev dependencies and build the TypeScript application
FROM deps AS build

# Install all dependencies (including devDependencies for building)
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy source code and build the application
COPY . .
RUN bun run build

# =============================================================================
# STAGE 4: Final Runtime Image
# =============================================================================
# Minimal production image with only necessary files
FROM base AS final

# Set production environment with security options
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512"

# Create a dedicated user for the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy package.json for package manager commands
COPY --chown=nextjs:nodejs package.json .

# Copy production dependencies and built application
COPY --from=deps --chown=nextjs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /usr/src/app/dist ./dist

# Switch to non-root user
USER nextjs

# Use dumb-init for proper signal handling and start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
