# Multi-stage Dockerfile for TypeScript-based Telegram Bot

# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install all dependencies (including devDependencies for build)
# Update CA certificates for secure connections
RUN apk update && apk add --no-cache ca-certificates && update-ca-certificates
RUN npm config set registry https://registry.npmjs.org/ && \
    DOCKER_BUILD=true yarn install --frozen-lockfile

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN yarn build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
# Update CA certificates for secure connections
RUN apk update && apk add --no-cache ca-certificates && update-ca-certificates
RUN npm config set registry https://registry.npmjs.org/ && \
    DOCKER_BUILD=true yarn install --frozen-lockfile --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set the entrypoint
CMD ["node", "dist/index.js"]