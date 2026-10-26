FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

# The database lives on a mounted disk at /data. Hosts that run this put their
# own proxy in front, so trust its X-Forwarded-* headers.
ENV NODE_ENV=production \
    PORT=8080 \
    DATABASE_PATH=/data/bookiebullies.db \
    TRUST_PROXY=1
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
