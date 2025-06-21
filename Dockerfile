# Multi-stage Dockerfile for TypeScript-based Telegram Bot

# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install all dependencies (including devDependencies for build)
# Configure npm and yarn for Docker environment
RUN npm config set strict-ssl false && \
    npm config set registry http://registry.npmjs.org/ && \
    yarn config set strict-ssl false && \
    sed -i 's/"preinstall": "npx only-allow yarn",/"preinstall": "",/' package.json && \
    yarn install --frozen-lockfile

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
# Configure npm and yarn for Docker environment
RUN npm config set strict-ssl false && \
    npm config set registry http://registry.npmjs.org/ && \
    yarn config set strict-ssl false && \
    sed -i 's/"preinstall": "npx only-allow yarn",/"preinstall": "",/' package.json && \
    yarn install --frozen-lockfile --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set the entrypoint
CMD ["node", "dist/index.js"]