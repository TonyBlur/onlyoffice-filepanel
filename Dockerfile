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

# Stage 3: Production — minimal deps, non-root user
FROM node:18

# Create non-root user (node:node is uid/gid 1000 in official images)
USER node
WORKDIR /app

COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps --omit=dev

# Copy compiled server from TypeScript build stage
COPY --chown=node:node --from=tcbuilder /app/dist ./dist

# Copy compiled frontend from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist/web/build

# Copy server templates
COPY --chown=node:node server/templates ./server/templates

# Create data directories with correct ownership
RUN mkdir -p server/data/files server/templates

EXPOSE 3000
CMD ["node", "dist/server.js"]
