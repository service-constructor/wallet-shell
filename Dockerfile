#
# wallet-shell (personal cabinet): Vite/React SPA + express BFF in one image.
# The BFF runs from TS source via tsx (the project's tsc build is type-check
# only, noEmit) and serves the built SPA when SERVE_STATIC=1.
#
#   docker build -f wallet-shell/Dockerfile -t serviceconstructor-shell:latest wallet-shell/
#
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Produces dist/ (SPA). `npm run build` also type-checks via tsc -b.
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Reuse the fully-installed node_modules from build (has express, libsodium,
# tsx) rather than re-resolving — the BFF runs from TS source via tsx.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json ./
COPY server ./server
ENV SERVE_STATIC=1
ENV CABINET_PORT=4200
EXPOSE 4200
CMD ["npx", "tsx", "server/index.ts"]
