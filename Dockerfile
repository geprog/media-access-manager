FROM node:24.9.0-alpine

WORKDIR /app
EXPOSE 3000

COPY .output ./
COPY server/database/migrations /app/server/database/migrations
RUN mkdir -p /app/data && chown node:node /app/data

USER node

CMD ["node", \
    "--enable-source-maps", \
    "--permission", \
    "--allow-fs-read=/app", \
    "--allow-fs-write=/app/data", \
    "--allow-addons", \
    "./server/index.mjs"]