# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM deps AS build
COPY . ./
RUN npm run prisma:generate

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app .

EXPOSE 3000
CMD ["node", "src/index.js"]