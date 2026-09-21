# Runtime-only image. CI runs `npm run build` on the runner (needs a Postgres for
# prerendering) and this image packages the standalone output. Build locally with:
#   npm run build && docker build -t iroiro .
FROM node:24-slim AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static
COPY --chown=nextjs:nodejs public ./public
# Schema migration runner (deploy.yml runs it as a one-off ECS task before rolling the service).
# `pg` is already in the standalone node_modules via @prisma/adapter-pg.
# Separate COPYs keep the scripts/lib/ layout (a multi-source COPY flattens into the destination).
COPY --chown=nextjs:nodejs scripts/db-migrate.mjs ./scripts/
COPY --chown=nextjs:nodejs scripts/lib/schema-sections.mjs ./scripts/lib/
COPY --chown=nextjs:nodejs db/schema.sql db/catalog-schema.sql ./db/
# RDS CA bundle so DATABASE_URL can use sslmode=verify-full&sslrootcert=/app/rds-ca.pem
ADD --chown=nextjs:nodejs https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem ./rds-ca.pem
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
