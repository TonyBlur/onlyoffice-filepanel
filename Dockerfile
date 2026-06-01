# Build stage: build React frontend (Vite)
FROM node:18 AS builder

WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

COPY web/ .
RUN npm run build
# Vite outputs to /app/dist/ by default

# Production stage: Node.js server + static build
FROM node:18

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

COPY tsconfig.json .
COPY server.ts .
COPY server/ ./server/
RUN npx tsc

COPY --from=builder /app/dist ./dist/web/build

EXPOSE 3000
CMD ["node", "dist/server.js"]

