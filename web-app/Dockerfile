FROM node:22-bookworm-slim AS build
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
COPY packages/domain packages/domain
COPY packages/app-config packages/app-config
COPY packages/ui-tokens packages/ui-tokens
COPY packages/api-client packages/api-client
COPY packages/shared packages/shared
RUN npm run build --workspace @duolinting/domain
RUN npm run build --workspace @duolinting/app-config
RUN npm run build --workspace @duolinting/ui-tokens
RUN npm run build --workspace @duolinting/api-client
RUN npm run build --workspace @duolinting/shared
COPY web-app web-app
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_MOBILE_APP_URL=""
ENV VITE_MOBILE_APP_URL=$VITE_MOBILE_APP_URL
RUN npm run build --workspace @duolinting/web-app

FROM nginx:1.27-alpine
COPY web-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web-app/dist /usr/share/nginx/html
EXPOSE 80
