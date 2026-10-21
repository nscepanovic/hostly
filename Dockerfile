# One image for the whole app: the API serves the built SPA (WEB_DIST) and the WebSocket on one port.
# Used by docker-compose.dev.yml for the shared dev environment.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && pnpm --filter @hostly/api deploy --prod --legacy /out/api \
  && cp -r apps/api/drizzle /out/api/drizzle

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/web
COPY --from=build /out/api ./
COPY --from=build /app/apps/web/dist ./web
COPY docker/app/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
USER node
ENTRYPOINT ["/entrypoint.sh"]
