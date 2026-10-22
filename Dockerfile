FROM node:24-trixie-slim AS build
ARG KAMELOG_BUILD_SHA
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 KAMELOG_BUILD_SHA=${KAMELOG_BUILD_SHA}
RUN npm run build
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-trixie-slim AS runtime
ARG KAMELOG_BUILD_SHA
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 KAMELOG_DATA_DIR=/data KAMELOG_BUILD_SHA=${KAMELOG_BUILD_SHA}
COPY --from=build --chown=node:node /app/.next/standalone ./
# The standalone trace covers the web server, not the separately executed federation worker.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/server ./server
# Node 24 executes the TypeScript CLI entry points directly.
COPY --from=build --chown=node:node /app/scripts/admin.ts ./scripts/admin.ts
COPY --from=build --chown=node:node /app/scripts/auto-tag.ts ./scripts/auto-tag.ts
COPY --from=build --chown=node:node /app/scripts/auto-thread.ts ./scripts/auto-thread.ts
COPY --from=build --chown=node:node /app/scripts/federation-worker.ts ./scripts/federation-worker.ts
COPY --from=build --chown=node:node /app/scripts/federation-worker-health.ts ./scripts/federation-worker-health.ts
# Production entry points use Node directly; exclude unused package-manager dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
