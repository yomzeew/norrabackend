FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Same image runs both roles; the command decides which.
# API:    node src/server.js
# Worker: node src/worker.js
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
