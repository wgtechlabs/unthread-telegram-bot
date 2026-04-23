# =============================================================================
# UNTHREAD TELEGRAM BOT - DOCKERFILE
# =============================================================================
# Multi-stage Docker build for the Unthread Telegram Bot
# 
# Build stages:
# 1. deps    - Install production dependencies only
# 2. build   - Install dev dependencies and build the application
# 3. final   - Create minimal runtime image with built app
#
# Usage:
#   docker build -t unthread-telegram-bot .
#   docker run --env-file .env unthread-telegram-bot
# =============================================================================

# syntax=docker/dockerfile:1

# Use Node.js 22.16 LTS Alpine with security patches
ARG NODE_VERSION=22.16-alpine3.21
# Pinned Bun version for reproducible builds
ARG BUN_VERSION=1.3.13

# =============================================================================
# STAGE 1: Base Image
# =============================================================================
# Alpine Linux 3.21 base for minimal image size with latest security updates.
# Bun is installed for dependency management and building only — the final
# runtime still launches the bot with Node.js.
FROM node:${NODE_VERSION} AS base
ARG BUN_VERSION

# Install security updates for Alpine packages and Bun
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/* && \
    npm install -g bun@${BUN_VERSION}

# Set working directory for all subsequent stages
WORKDIR /usr/src/app

# =============================================================================
# STAGE 2: Production Dependencies
# =============================================================================
# Install only production dependencies for runtime
FROM base AS deps

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
