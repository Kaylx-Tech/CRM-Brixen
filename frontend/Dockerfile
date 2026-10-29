# Stage 1: Build React/Vite App
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Coolify passes env vars as build args. Set VITE_API_URL there to test against another API
# (e.g. a temporary sslip.io backend); when it is not set the production API URL from
# .env.production is used.
# VITE_PRODUCT=finstap builds the Finstap app (signup + workspace login); empty = Brixen
ARG VITE_API_URL
ARG VITE_PRODUCT
# Error tracking (GlitchTip DSN of this site's project); unset = no errors are sent. Vite reads VITE_* build args.
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
# A Finstap build without its API address would fall back to "/api" and fail in confusing ways: stop here
RUN if [ -z "$VITE_API_URL" ] && grep -q '^VITE_PRODUCT=finstap' .env.production 2>/dev/null; then \
      echo "ERROR: set VITE_API_URL as a Build Variable in Coolify (e.g. https://api.finstap.com/api)"; exit 1; \
    fi
RUN if [ -n "$VITE_API_URL" ]; then export VITE_API_URL="$VITE_API_URL"; fi && \
    if [ -n "$VITE_PRODUCT" ]; then export VITE_PRODUCT="$VITE_PRODUCT"; fi && npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
