# Neo Community Edition — dev shortcuts.
.PHONY: setup db migrate seed dev build up down smoke

setup:   ## one-command dev bootstrap (env, deps, db, migrate, seed)
	./setup.sh

db:      ## start just Postgres (docker)
	docker compose up -d db

migrate: ## apply migrations to $DATABASE_URL
	node scripts/ce-migrate.mjs

seed:    ## load anonymised sample data
	node scripts/ce-seed-load.mjs

dev:     ## run the app in dev mode (also run `make jobs` in another terminal)
	npm run dev

jobs:    ## run the Inngest dev server — executes assessment background jobs
	npx inngest-cli@latest dev -u http://localhost:3000/api/inngest

build:   ## production build
	npm run build

up:      ## full stack (Postgres + app) via docker
	docker compose up --build

down:    ## stop the docker stack
	docker compose down

smoke:   ## run the pg-shim smoke test against $DATABASE_URL
	npm run db:smoke
