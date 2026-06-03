# Stage 1: Build React frontend (Vite)
FROM node:18 AS builder

WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

COPY web/ .
RUN npm run build

# Stage 2: Compile TypeScript server
FROM node:18 AS tcbuilder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

COPY tsconfig.json .
COPY server.ts .
COPY server/ ./server/
RUN npx tsc

# Stage 3: Production — minimal deps, entrypoint drops to non-root at runtime
FROM node:18

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps --omit=dev

# Copy compiled server from TypeScript build stage
COPY --from=tcbuilder /app/dist ./dist

# Copy compiled frontend from builder stage
COPY --from=builder /app/dist ./dist/web/build

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
