FROM node:26.8.1-slim

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

USER node

CMD ["node", \
    "--enable-source-maps", \
    "--permission", \
    "--allow-fs-read=/app", \
    "--allow-fs-write=/app/data", \
    "--allow-addons", \
    "--allow-net", \
    "./server/index.mjs"]