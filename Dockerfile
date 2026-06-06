# Stage 1: Build frontend (Vite) + compile server (TypeScript)
FROM node:18 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

# Build frontend (vite outputs to dist/web/build/)
COPY web/ ./web/
RUN npx vite build --config web/vite.config.ts

# Compile server (tsc outputs to dist/)
COPY tsconfig.json server.ts ./
COPY server/ ./server/
RUN npx tsc

# Stage 2: Production — minimal deps, entrypoint drops to non-root at runtime
FROM node:18

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps --omit=dev

# Copy all compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy server templates
COPY server/templates ./server/templates

# Create data directories
RUN mkdir -p server/data/files server/templates

# Entrypoint fixes volume ownership at runtime, then drops to node user
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
