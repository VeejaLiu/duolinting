# The official site is intentionally built in its own context: it is a
# separate project, not a workspace in the main DuolinTing monorepo.
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=duolinting-official-site-npm,target=/root/.npm,sharing=locked \
    npm ci

COPY . ./

# Vite exposes VITE_* values to browser code at build time. The Compose file
# supplies the public learner-web URL only for the production image build.
ARG VITE_LEARNER_APP_URL=""
ENV VITE_LEARNER_APP_URL=$VITE_LEARNER_APP_URL
ARG VITE_OFFICIAL_SITE_URL="https://www.duolinting.cn"
ENV VITE_OFFICIAL_SITE_URL=$VITE_OFFICIAL_SITE_URL
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# vinext's standalone output contains the server and static assets. React is
# imported by vinext's runtime itself but is not listed in the emitted externals
# manifest, so copy the three required React runtime packages explicitly.
COPY --from=build /app/dist/standalone ./
COPY --from=build /app/node_modules/react ./node_modules/react
COPY --from=build /app/node_modules/react-dom ./node_modules/react-dom
COPY --from=build /app/node_modules/react-server-dom-webpack ./node_modules/react-server-dom-webpack

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
