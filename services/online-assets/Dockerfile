FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY services/online-assets ./services/online-assets
RUN npm run build:online-assets

FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=8788
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/services/online-assets/dist ./services/online-assets/dist
COPY services/online-assets/migrations ./services/online-assets/migrations
COPY LICENSE ./LICENSE

USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8788/readyz').then((res) => { if (!res.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "services/online-assets/dist/server.js"]
