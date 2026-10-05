# ==============================================================================
# Multi-stage Dockerfile for Real Estate AI Marketing Agent CMS
# ==============================================================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies required for node-gyp / native builds
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy project source code
COPY . .

# Build application bundle
RUN npm run build

# Remove development dependencies to prepare minimal artifact
RUN npm prune --production

# ==============================================================================
# Stage 2: Production runner
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Security: Create non-root user and group
RUN addgroup -S nodejs -g 1001 && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy production node_modules from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy Prisma schema and engines
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Copy built dist files and package.json
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Copy server files for runtime (support TS/node execution)
COPY --from=builder --chown=nodejs:nodejs /app/server.ts ./server.ts
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/src ./src

# Create runtime directories with proper permissions
RUN mkdir -p runtime/social-media runtime/agent-cdp-profile && \
    chown -R nodejs:nodejs runtime

# Switch to non-root user
USER nodejs

EXPOSE 3000

# Healthcheck using liveness probe /healthz
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

# Default command
CMD ["npm", "run", "start"]
