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
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
