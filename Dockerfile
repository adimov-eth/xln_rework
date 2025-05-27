# XLN Dockerfile - Multi-stage build for production optimization

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm ci --only=development

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build && \
    npm prune --production

# Stage 2: Production stage
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S xln && \
    adduser -S xln -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copy built application and dependencies
COPY --from=builder --chown=xln:xln /app/dist ./dist
COPY --from=builder --chown=xln:xln /app/node_modules ./node_modules
COPY --from=builder --chown=xln:xln /app/package.json ./

# Copy configuration files
COPY --chown=xln:xln docs/ ./docs/
COPY --chown=xln:xln README.md ./
COPY --chown=xln:xln LICENSE ./

# Create data directory
RUN mkdir -p /app/data && \
    chown -R xln:xln /app/data

# Create logs directory
RUN mkdir -p /app/logs && \
    chown -R xln:xln /app/logs

# Switch to non-root user
USER xln

# Expose ports
EXPOSE 8080 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Environment variables
ENV NODE_ENV=production
ENV XLN_HOST=0.0.0.0
ENV XLN_PORT=8080
ENV XLN_STORAGE_PATH=/app/data
ENV XLN_LOG_LEVEL=info

# Volume for persistent data
VOLUME ["/app/data", "/app/logs"]

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Metadata
LABEL maintainer="XLN Development Team"
LABEL version="1.0.0"
LABEL description="XLN - Extended Lightning Network Node"
LABEL org.opencontainers.image.source="https://github.com/xln/xln"
LABEL org.opencontainers.image.title="XLN Node"
LABEL org.opencontainers.image.description="Hierarchical blockchain architecture with reserve-credit payment channels"
LABEL org.opencontainers.image.version="1.0.0"