FROM node:18
WORKDIR /app
# copy only package files then install ALL dependencies inside container
COPY package.json package-lock.json* ./
# use npm ci to install exact deps (including devDeps like vite/esbuild) for linux
RUN npm ci --no-audit --no-fund --legacy-peer-deps
# copy project sources (do not copy host node_modules)
COPY . .
EXPOSE ${DEV_PORT:-3000}
# project uses react-scripts; use npm start
CMD ["npm", "start"]
