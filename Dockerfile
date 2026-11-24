FROM node:26.13.0-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072

# sharp renders the QR token label from SVG text, which needs system fonts
# (DejaVu provides the monospace family) and a fontconfig config to find them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
EXPOSE 3000

COPY .output ./
COPY server/db/migrations /app/server/db/migrations
RUN mkdir -p /app/data && chown node:node /app/data
# Mount point for a white-label logo and favicon, served at `/branding/*` and
# read at request time – which is what lets a deployment brand a published
# image without rebuilding it. Empty on purpose: nothing is branded until a
# deployment mounts a file and names it.
RUN mkdir -p /app/branding

USER node

CMD ["node", \
    "--enable-source-maps", \
    "--permission", \
    "--allow-fs-read=/app", \
    "--allow-fs-write=/app/data", \
    "--allow-addons", \
    "--allow-net", \
    "./server/index.mjs"]