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

# Use Node.js LTS Alpine for smaller image size
ARG NODE_VERSION=20.18.0

# =============================================================================
# STAGE 1: Base Image
# =============================================================================
# Alpine Linux base for minimal image size
FROM node:${NODE_VERSION}-alpine AS base

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
    --mount=type=bind,source=yarn.lock,target=yarn.lock \
    --mount=type=cache,target=/root/.yarn \
    yarn install --production --frozen-lockfile

# =============================================================================
# STAGE 3: Build Application  
# =============================================================================
# Install dev dependencies and build the TypeScript application
FROM deps AS build

# Install all dependencies (including devDependencies for building)
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=yarn.lock,target=yarn.lock \
    --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile

# Copy source code and build the application
COPY . .
RUN yarn run build

# Copy non-TypeScript files that need to be in the final build
RUN cp src/database/schema.sql dist/database/

# =============================================================================
# STAGE 4: Final Runtime Image
# =============================================================================
# Minimal production image with only necessary files
FROM base AS final

# Set production environment
ENV NODE_ENV=production

# Run as non-root user for security
USER node

# Copy package.json for package manager commands
COPY package.json .

# Copy production dependencies and built application
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# Start the application
CMD ["yarn", "start"]
