# Neo Community Edition

Self-hostable, open-source AI governance. Classify AI use cases, assign a risk tier,
select controls, capture evidence, and run red-team scenarios — on your own
infrastructure, with your own model key.

Neo Community Edition is the open core of [Neo Control](https://neocontrol.ai).
It ships the assessment and control engine; the hosted product adds the paid
modules (AI Supply Chain, Vendor Risk, AI Action Fabric, Shadow AI) and managed
operations.

## What's included

- **Classify & Risk Tier** — describe a use case, get a tier with a human acceptance gate.
- **Control selection** — protective + detective controls by tier and pattern.
- **Evidence & verification** — manual, JSON-import, and HTTP collectors; control badges.
- **Red Team** — grounded attack-path scenarios against your authority graph.
- **Framework crosswalks** — NIST AI RMF, ISO 42001, EU AI Act, OWASP, SR 11-7, NYDFS Part 500.
- **Built-in auth** — coarse RBAC out of the box; connect your own SSO/OIDC when ready.
- **Bring your own model** — Anthropic, Amazon Bedrock, or Google Vertex. Usage bills to you.

## Not included (Neo Control)

AI Supply Chain / AI-BOM, Vendor Risk reviews, the AI Action Fabric (mediation/PDP-PEP),
and Shadow AI discovery. These are commercial modules of the hosted product.

Runs on **any Postgres** — no Supabase account, no managed services. Bring your own
model key.

## Quick start

> **Deploying to a server or AWS, or need a model key?** See **[DEPLOY.md](DEPLOY.md)** —
> getting an Anthropic key or setting up Amazon Bedrock, EC2 and ECS Fargate, first run, and
> troubleshooting.

**Everything in Docker (Postgres + app):**

```bash
docker compose up --build      # → http://localhost:3000  (migrates + seeds on boot)
```

**Local dev (one command):**

```bash
./setup.sh        # writes .env, installs deps, starts Postgres (docker), migrates + seeds
npm run dev       # → http://localhost:3000
```

**Manual:**

```bash
cp .env.example .env          # set DATABASE_URL, SKY_SESSION_SECRET, your model key
npm install
npm run db:migrate            # apply schema to any Postgres
npm run db:seed               # optional: anonymised sample data
npm run build && npm start
```

Then open the console, create the first account (built-in auth), and start an assessment.
`make` lists the dev shortcuts.

**Background jobs.** The assessment engine (classify → questions → controls → red-team) runs as
durable background jobs. The Docker path starts the job runner automatically. If you run the app
directly, start it too (once): `make jobs` — or `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`.
Without it, assessments stay "pending."

## How deployment works

End to end, from bare machine to first assessment:

1. **Provision** a host with Docker (any VM; on AWS a `t3.large`). Using Bedrock? Attach an IAM
   role with `bedrock:InvokeModel` — then there are no keys to handle.
2. **Configure one file:** `cp .env.example .env`, then set `SKY_SESSION_SECRET` (the one required
   value) and optionally point `DATABASE_URL` at your own Postgres/RDS. The model key can go here
   (`ANTHROPIC_API_KEY`, or `MODEL_PROVIDER=bedrock`) or you can paste it in the app at first run.
3. **One command:** `docker compose up --build -d`. This starts Postgres + the app + the job runner,
   **runs all migrations automatically**, and serves on port 3000. (Put a reverse proxy in front for TLS.)
4. **Guided first run:** open the app → sign up (first user is the admin) → a **setup screen**
   live-checks Database, Background jobs, and Model key. No key set? Paste your Anthropic key right
   there (stored encrypted, no `.env` edit). Green across the board means you're wired.
5. **Use it:** add a use case, run the assessment, invite teammates, or spin up more organizations
   from the built-in org switcher. Connect your own SSO anytime via the `NEO_CE_OIDC_*` vars.

Migrations, the job runner, and health verification are automatic — the manual parts are a few
`.env` values and TLS. Full copy-paste steps (plus an ECS Fargate + RDS variant) are in
**[DEPLOY.md](DEPLOY.md)**.

## Configuration

Everything is env-driven (`.env`):

| Setting | What |
| --- | --- |
| `DATABASE_URL` | any Postgres connection string |
| `AUTH_PROVIDER` | `builtin` (default) or `clerk` |
| `SKY_SESSION_SECRET` | built-in auth session key (`openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | your model key (or AWS Bedrock / GCP Vertex creds) |

**Auth modes:** defaults to **built-in** coarse RBAC — first account is admin, add the
rest in-app. For enterprise SSO, point `NEO_CE_OIDC_ISSUER` (+ client id/secret) at your
IdP. To use Clerk instead, set `AUTH_PROVIDER=clerk` and its keys. The identity layer is
provider-agnostic behind a single seam, so no code changes are needed to switch.

**Database:** CE talks to plain Postgres through a small `pg`-backed client — no Supabase.
Migrations create the schema (and the roles they reference) on any Postgres 14+.

## License

AGPL-3.0-or-later. See [LICENSE](./LICENSE). "Neo" and the Neo logo are trademarks
of Neo Control; see the hosted product for commercial use and the paid modules.

Questions: neo@neocontrol.ai
