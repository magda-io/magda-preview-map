FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
ARG GIT_COMMIT=container
RUN GIT_COMMIT=${GIT_COMMIT} yarn build:production && cp wwwroot/config.json default-client-config.json

FROM node:24-bookworm-slim AS runtime-dependencies

WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node --from=runtime-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/wwwroot ./wwwroot
COPY --chown=node:node --from=build /app/default-client-config.json ./default-client-config.json
COPY --chown=node:node package.json serverconfig.json ./
COPY --chown=node:node scripts/start-preview-server.cjs ./scripts/start-preview-server.cjs

USER node
EXPOSE 3001 6110
ENTRYPOINT ["node", "scripts/start-preview-server.cjs"]
