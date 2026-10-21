FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

ENV NODE_ENV=production \
    EXECUTION_POLICY=sandbox-required \
    PORT=3000 \
    TOURNAMENT_DATA_DIR=/app/data/tournaments \
    BOT_EXECUTION_WORKDIR=/app/.runtime/source-execution \
    BOT_COMPILED_ARTIFACT_CACHE_DIR=/app/.runtime/compiled-artifacts \
    BOT_CPP_EPHEMERAL_ARTIFACT_CACHE=false \
    BOT_CPP_COMPILATION_BACKEND=ephemeral-volume \
    OTT_DOCKER_EXECUTION_CONCURRENCY=1 \
    OTT_SERIES_MATCH_CONCURRENCY=2 \
    OTT_ENABLE_SERIES_CONCURRENCY_2=true

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates docker.io python3 g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build \
    && npm prune --omit=dev \
    && mkdir -p /app/data/tournaments /app/.runtime/source-execution /app/.runtime/compiled-artifacts

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
