# Build stage: build React frontend
FROM node:18 AS builder

WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY web/ .
ENV REACT_APP_VERSION=0.2.0
RUN npm run build

# Production stage: Node.js server + static build
FROM node:18

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund --legacy-peer-deps

COPY server/ ./server/
COPY --from=builder /app/build ./web/build
COPY server.js .

EXPOSE 4000
CMD ["node", "server.js"]
