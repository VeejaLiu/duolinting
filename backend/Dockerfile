FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY web-app/package.json web-app/package.json
COPY admin/package.json admin/package.json
COPY mobile-app/package.json mobile-app/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/app-config/package.json packages/app-config/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=duolinting-npm,target=/root/.npm,sharing=locked \
    npm ci --workspaces --include-workspace-root

FROM deps AS build
COPY packages/domain packages/domain
COPY packages/shared packages/shared
COPY backend backend
RUN npm run build --workspace @duolinting/domain
RUN npm run build --workspace @duolinting/shared
RUN npm run build --workspace @duolinting/backend

FROM node:22-bookworm-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY web-app/package.json web-app/package.json
COPY admin/package.json admin/package.json
COPY mobile-app/package.json mobile-app/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/app-config/package.json packages/app-config/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=duolinting-npm,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --workspace @duolinting/backend \
    --workspace @duolinting/domain --workspace @duolinting/shared

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/domain/package.json packages/domain/package.json
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/app.js"]
