# Stage 1: Build React/Vite App
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Coolify passes env vars as build args. Set VITE_API_URL there to test against another API
# (e.g. a temporary sslip.io backend); when it is not set the production API URL from
# .env.production is used.
ARG VITE_API_URL
# Error tracking (GlitchTip DSN of this site's project); unset = no errors are sent. Vite reads VITE_* build args.
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
RUN if [ -n "$VITE_API_URL" ]; then export VITE_API_URL="$VITE_API_URL"; fi && npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
