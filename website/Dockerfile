# brixenconsultants.com (Next.js) for Coolify: Build Pack "Dockerfile", Base Directory /website, port 3000.

# Stage 1: install and build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Coolify passes these as build args (tick "Build Variable"). NEXT_PUBLIC_* and SITE_LIVE are fixed into the pages at
# build time, so change them in Coolify and redeploy.
#   SITE_LIVE=1                 only on the real brixenconsultants.com (lets search engines in; unset = hidden)
#   NEXT_PUBLIC_SITE_URL        this site's address (canonical links, sitemap); default https://brixenconsultants.com
#   NEXT_PUBLIC_API_URL         the CRM API; default https://api.brixenconsultants.com/api
#   NEXT_PUBLIC_PORTAL_URL      the client portal; default https://portal.brixenconsultants.com
ARG SITE_LIVE
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PORTAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: only what the server needs (Next.js standalone output)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S web && adduser -S web -G web
COPY --from=builder --chown=web:web /app/.next/standalone ./
COPY --from=builder --chown=web:web /app/.next/static ./.next/static
COPY --from=builder --chown=web:web /app/public ./public
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
