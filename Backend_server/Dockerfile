FROM node:22.17.0-alpine3.22 AS dependencies
WORKDIR /build
COPY Backend_server/package.json Backend_server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22.17.0-alpine3.22 AS runtime
ENV NODE_ENV=production \
    PORT=5000 \
    HOME=/tmp
WORKDIR /app
RUN apk add --no-cache dumb-init=1.2.5-r3 \
    && addgroup -S -g 10001 nodeapp \
    && adduser -S -D -H -u 10001 -G nodeapp nodeapp \
    && mkdir -p /app/uploads /tmp \
    && chown -R nodeapp:nodeapp /app /tmp
COPY --from=dependencies --chown=nodeapp:nodeapp /build/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp Backend_server/ ./
COPY --chown=nodeapp:nodeapp WebMapEditor/ /WebMapEditor/
USER 10001:10001
EXPOSE 5000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/live || exit 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
