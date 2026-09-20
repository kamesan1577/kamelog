FROM node:24-bookworm-slim AS build
ARG KAMELOG_BUILD_SHA
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 KAMELOG_BUILD_SHA=${KAMELOG_BUILD_SHA}
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ARG KAMELOG_BUILD_SHA
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 KAMELOG_DATA_DIR=/data KAMELOG_BUILD_SHA=${KAMELOG_BUILD_SHA}
COPY --from=build --chown=node:node /app/.next/standalone ./
# The standalone trace covers the web server, not the separately executed federation worker.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts/admin.mjs ./scripts/admin.mjs
COPY --from=build --chown=node:node /app/scripts/auto-tag.mjs ./scripts/auto-tag.mjs
COPY --from=build --chown=node:node /app/scripts/auto-thread.mjs ./scripts/auto-thread.mjs
COPY --from=build --chown=node:node /app/scripts/federation-worker.mjs ./scripts/federation-worker.mjs
COPY --from=build --chown=node:node /app/scripts/federation-worker-health.mjs ./scripts/federation-worker-health.mjs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
