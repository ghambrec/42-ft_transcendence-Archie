FROM node:24-alpine AS deps

WORKDIR /app

RUN corepack enable

ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile


FROM deps AS build

COPY . .

RUN pnpm run build


FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/frontend/browser /srv

EXPOSE 443
