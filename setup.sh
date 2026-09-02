#!/usr/bin/env bash
#
# Neo Community Edition — dev bootstrap. One command from a fresh clone to a running
# local instance:  ./setup.sh   (then `npm run dev`).
#
# Uses Docker for Postgres if available; otherwise point DATABASE_URL at your own.
#
set -euo pipefail

echo "==> Neo Community Edition — dev setup"
command -v node >/dev/null || { echo "Node 20+ required (https://nodejs.org)"; exit 1; }

# 1. .env from template, with a generated session secret
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  node -e "const f=require('fs');let s=f.readFileSync('.env','utf8');s=s.replace(/^SKY_SESSION_SECRET=.*/m,'SKY_SESSION_SECRET='+process.argv[1]);f.writeFileSync('.env',s)" "$SECRET"
  echo "  wrote .env (add your ANTHROPIC_API_KEY to run real assessments; blank works in demo/mock mode)"
fi

# 2. deps
echo "==> installing dependencies"
npm install

# 3. Postgres (docker) if available, else use whatever DATABASE_URL points to
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  echo "==> starting Postgres (docker)"
  docker compose up -d db
  echo -n "   waiting for Postgres"
  for _ in $(seq 1 40); do
    if docker compose exec -T db pg_isready -U neo -d neo >/dev/null 2>&1; then echo " — ready"; break; fi
    echo -n "."; sleep 1
  done
else
  echo "==> Docker not found — using DATABASE_URL from .env (make sure it points at a Postgres you can reach)"
fi

# 4. load env, migrate, seed
set -a; . ./.env; set +a
echo "==> applying migrations"
node scripts/ce-migrate.mjs
echo "==> loading sample data"
node scripts/ce-seed-load.mjs || echo "   (no seed / skipped)"

cat <<'DONE'

==> Ready.
    Start the app:   npm run dev        → http://localhost:3000
    Background jobs: make jobs           (Inngest dev server — needed to run assessments)
    Or full stack:   docker compose up --build   (includes jobs automatically)
    First run: open the app, create the first account (built-in auth) and start an assessment.
DONE
