FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY data ./data
COPY scripts/validate-data.mjs scripts/build-static.mjs ./scripts/
COPY index.html styles.css app.js server.mjs ./
COPY lib ./lib
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
