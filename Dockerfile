# =============================================================
# Stage 1: Build Environment (Node.js 20 Alpine)
# =============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install system utilities needed for building native modules
RUN apk add --no-cache libc6-compat

# Copy package manifests
COPY package.json package-lock.json* ./

# Install dependencies deterministically
RUN if [ -f package-lock.json ]; then npm ci; else npm install --legacy-peer-deps; fi

# Copy application source code
COPY . .

# Set up build arguments & production environment
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV NODE_ENV=production

# Compile production bundle (generates sitemap and Vite static bundle in dist/)
RUN npm run build

# =============================================================
# Stage 2: Hardened Production Runner (Nginx 1.25 Alpine)
# =============================================================
FROM nginx:1.25-alpine AS runner

# Create non-root nginx runtime user permissions
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /var/log/nginx

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy production Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static distribution from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure correct permissions for static files
RUN chown -R nginx:nginx /usr/share/nginx/html

# Expose standard container ports (80, 8080, 3000)
EXPOSE 80 8080 3000

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
