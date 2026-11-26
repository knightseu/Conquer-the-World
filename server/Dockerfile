# Build from the repo root: docker build -f server/Dockerfile .
# (The server reads api/openapi.yaml at runtime, so the context must include api/.)
FROM node:24-slim AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/ ./
COPY api/ /app/api/
RUN pnpm build && pnpm prune --prod

FROM node:24-slim
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION
WORKDIR /app/server
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/migrations ./migrations
COPY api/ /app/api/
USER node
EXPOSE 3000
# Render's pre-deploy command runs migrations before this starts:
#   node node_modules/node-pg-migrate/bin/node-pg-migrate.js up -m migrations
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
