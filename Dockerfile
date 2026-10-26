# syntax=docker/dockerfile:1.7
# Imágenes de producción (Fase 8). Un solo build del monorepo y tres imágenes finales:
#   app     → API (y comandos de mantenimiento: migraciones, seed, create-admin, recover-access)
#   worker  → la misma app + Tesseract/poppler para OCR de PDF escaneados (ADR 0010)
#   web     → Caddy con la SPA compilada (reverse proxy y TLS)
# Las versiones de las imágenes base se fijan por tag; en el servidor conviene fijarlas por
# digest (ver docs/deploy.md).

ARG NODE_IMAGE=node:22-bookworm-slim
ARG CADDY_IMAGE=caddy:2-alpine

# --- Build: dependencias completas y compilación de todo -----------------------------
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm CI=true
RUN corepack enable
WORKDIR /repo
# Primero solo los manifiestos: la capa de dependencias se reutiliza mientras no cambien.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @tli/shared build \
 && pnpm --filter @tli/db build \
 && pnpm --filter @tli/api build \
 && pnpm --filter @tli/web build

# --- Dependencias de producción (sin herramientas de desarrollo) ------------------------
FROM ${NODE_IMAGE} AS prod-deps
ENV PNPM_HOME=/pnpm CI=true
# Prisma elige el motor según la versión de OpenSSL: tiene que ser la misma que en runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @tli/api...
COPY packages/db/prisma packages/db/prisma
# El cliente de Prisma se genera acá, contra las dependencias que van a producción.
RUN pnpm --filter @tli/db exec prisma generate

# --- app: API y comandos de mantenimiento ---------------------------------------------
FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production
# openssl: lo necesita el motor de Prisma. tini: reenvía señales y cosecha procesos.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=prod-deps --chown=root:root /repo /app
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
# El seed de desarrollo (usuarios con contraseña conocida) no va a producción.
RUN rm -f packages/db/dist/seed/dev.* \
 && mkdir -p /data/storage && chown node:node /data/storage
USER node
WORKDIR /app/apps/api
ENV STORAGE_LOCAL_DIR=/data/storage
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# --- worker: la app + OCR ----------------------------------------------------------------
FROM app AS worker
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-spa \
 && rm -rf /var/lib/apt/lists/*
USER node
HEALTHCHECK NONE
CMD ["node", "dist/worker.main.js"]

# --- web: Caddy con la SPA ---------------------------------------------------------------
FROM ${CADDY_IMAGE} AS web
COPY --from=build /repo/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
