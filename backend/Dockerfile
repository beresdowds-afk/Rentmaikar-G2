# =============================================================
# Stage 1: Build Backend TypeScript
# =============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies deterministically
COPY package.json package-lock.json* tsconfig.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source files, public assets, and data files
COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/

# Compile TypeScript to dist/
RUN npm run build

# =============================================================
# Stage 2: Production Lightweight Container Runner
# =============================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy compiled JavaScript output, data directory, and static brand assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data

# Ensure non-root node user owns application files
RUN chown -R node:node /app

# Non-root user for container security
USER node

EXPOSE 8080

CMD ["node", "dist/index.js"]
