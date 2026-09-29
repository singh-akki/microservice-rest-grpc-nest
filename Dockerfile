# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-alpine

# ==========================================
# 1. Base stage with system dependencies
# ==========================================
FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app

# ==========================================
# 2. Dependencies stage
# ==========================================
FROM base AS dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci && npx prisma generate

# ==========================================
# 3. Builder stage
# ==========================================
FROM dependencies AS builder
ARG SERVICE_NAME=api-gateway
ENV SERVICE_NAME=${SERVICE_NAME}

COPY nest-cli.json tsconfig*.json ./
COPY proto ./proto/
COPY libs ./libs/
COPY apps ./apps/

# Build target microservice
RUN if [ "$SERVICE_NAME" != "migrator" ]; then \
      npx nest build ${SERVICE_NAME}; \
    fi

# ==========================================
# 4. Production Runner stage
# ==========================================
FROM base AS runner
ARG SERVICE_NAME=api-gateway
ENV SERVICE_NAME=${SERVICE_NAME}
ENV NODE_ENV=production

WORKDIR /app

# Copy production artifacts
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/package.json ./package.json

# Run as non-root user
USER node

# Health check default port (can be overridden per container)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["node dist/apps/${SERVICE_NAME}/src/main.js"]
