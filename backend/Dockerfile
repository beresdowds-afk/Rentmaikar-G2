# =============================================================
# Stage 1: Build Backend TypeScript
# =============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json tsconfig.json ./
RUN npm install

# Copy source files and compile TypeScript
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# =============================================================
# Stage 2: Production Lightweight Container Runner
# =============================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package.json ./
RUN npm install --only=production

# Copy compiled JavaScript output and static brand assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Non-root user for container security
USER node

EXPOSE 5000

CMD ["node", "dist/index.js"]
