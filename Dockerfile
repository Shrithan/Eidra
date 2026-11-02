# Watchworld: one container serves the website, the API and the live game rooms on a single port.
FROM node:22-slim AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
COPY web/package.json web/package-lock.json web/
RUN npm --prefix server ci && npm --prefix web ci
COPY shared shared
COPY server server
COPY web web
# the deployed site runs with no bots at all
ENV VITE_BOTS=0
RUN npm --prefix web run build && npm --prefix server run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production BOTS=0 PORT=8080 WEB_DIST=/app/web/dist
COPY --from=build /app/shared shared
COPY --from=build /app/server/package.json /app/server/package-lock.json server/
RUN npm --prefix server ci --omit=dev
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
# sessions, the stream index and game scores live here: mount a volume on it so they survive restarts
VOLUME /app/server/data
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
