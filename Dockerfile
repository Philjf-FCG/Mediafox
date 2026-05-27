FROM node:24-slim AS builder
WORKDIR /app

# Server build
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build:server

# Client build
COPY client/package*.json ./client/
RUN npm ci --prefix client
COPY client/index.html ./client/
COPY client/vite.config.ts ./client/
COPY client/src ./client/src
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build:client

FROM node:24-slim
WORKDIR /app

COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && \
    npm ci --omit=dev && \
    apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/build ./client/build

RUN mkdir -p /opt/data/media
RUN useradd -r -s /sbin/nologin foxuser && chown -R foxuser:foxuser /opt/data
USER foxuser

ENV PORT=5004
ENV NODE_ENV=production
ENV DATABASE_PATH=/opt/data/mediafox.db
ENV MEDIA_STORAGE_PATH=/opt/data/media

EXPOSE 5004
CMD ["node", "dist/server.js"]
