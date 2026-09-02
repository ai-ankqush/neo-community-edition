# Deploying Neo Community Edition

Three things run: the **app** (Next.js), a **Postgres** database, and a small **job
runner** (Inngest) for the assessment engine. `docker compose` wires up all three, so
most people never think about them separately.

Pick your path:

- [1. Get a model key](#1-get-a-model-key) — do this first (Anthropic or Bedrock)
- [2. Run it locally / any Docker host](#2-run-it-locally-or-on-any-docker-host)
- [3. Run it on AWS (EC2 — simplest)](#3-run-it-on-aws-ec2--simplest)
- [4. Run it on AWS (ECS Fargate + RDS — managed)](#4-run-it-on-aws-ecs-fargate--rds--managed)
- [5. First run](#5-first-run)
- [6. Troubleshooting](#6-troubleshooting)

Neo brings **your** model key — usage bills to you, and no prompts or data leave your
deployment except the model calls you make.

---

## 1. Get a model key

You need **one** of these. Anthropic is the fastest to start; Bedrock is nice if you're
already on AWS and want everything inside your account.

> **You don't have to put the key in a config file.** The first-run setup screen has a
> "Paste your Anthropic key" field — enter it there and it's stored encrypted for your
> organization, no `.env` edit or restart needed (see [First run](#5-first-run)). Setting
> `ANTHROPIC_API_KEY` in `.env` still works and is handy for automated deploys; either is fine.

### Option A — Anthropic API (simplest)

1. Go to **https://console.anthropic.com** → **Settings → API Keys → Create Key**.
2. Copy the key (starts with `sk-ant-api03-…`). You only see it once.
3. Make sure the account has credit (Billing) — a fresh key with no credit returns
   `401 invalid x-api-key` or gets rate-limited.

Then either paste it on the setup screen, or set `ANTHROPIC_API_KEY=sk-ant-…` in `.env`.

### Option B — Amazon Bedrock (uses your AWS account, no API key)

**Prerequisites:**

1. **Enable the models.** AWS console → **Bedrock → Model access** → request/enable the
   **Anthropic Claude** models in the region you'll run in (e.g. `us-east-1`). Approval is
   usually instant.
2. **Grant permission.** The app needs `bedrock:InvokeModel`. On AWS this is automatic
   from the **EC2 instance role** or **ECS task role** you attach (see steps 3/4) — no keys
   to paste. Running off AWS? Set `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` of an IAM
   user with that permission.
3. **Find the model ids.** Bedrock console → **Model catalog** → copy the *inference
   profile id* for each Claude model in your region (they look like
   `us.anthropic.claude-...-v1:0`).

You'll set these in your `.env`:

```
MODEL_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_DEEP=us.anthropic.claude-opus-4-...-v1:0
BEDROCK_MODEL_FAST=us.anthropic.claude-sonnet-4-...-v1:0
BEDROCK_MODEL_SCAFFOLD=us.anthropic.claude-haiku-4-...-v1:0
```

---

## 2. Run it locally (or on any Docker host)

Prerequisites: **Docker** (with Compose).

```bash
git clone https://github.com/ai-ankqush/neo-community-edition.git
cd neo-community-edition
cp .env.example .env
```

Edit `.env`: the only value you must set is `SKY_SESSION_SECRET` (`openssl rand -base64 32`).
You can also set your model key here (`ANTHROPIC_API_KEY=…`, or the `MODEL_PROVIDER=bedrock`
block) — or skip it and paste the key on the setup screen after first launch. Then:

```bash
docker compose up --build       # → http://localhost:3000
```

That starts Postgres, applies migrations, seeds sample data, launches the job runner, and
serves the app. Done.

---

## 3. Run it on AWS (EC2 — simplest)

This is the lowest-friction production path: one VM running the same `docker compose`.

1. **Launch an instance.** EC2 → Amazon Linux 2023, `t3.large` (2 vCPU / 8 GB) or bigger.
   - Security group: allow inbound **80/443** (and **22** for SSH). Everything else stays internal.
   - **Using Bedrock?** Attach an **IAM instance role** with `bedrock:InvokeModel` — then you
     never handle AWS keys.

2. **Install Docker + Compose:**

   ```bash
   sudo dnf update -y && sudo dnf install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user   # log out/in once so `docker` works without sudo
   DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
   mkdir -p $DOCKER_CONFIG/cli-plugins
   curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
     -o $DOCKER_CONFIG/cli-plugins/docker-compose
   chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
   ```

3. **Clone + configure:**

   ```bash
   git clone https://github.com/ai-ankqush/neo-community-edition.git
   cd neo-community-edition
   cp .env.example .env
   openssl rand -base64 32          # paste into SKY_SESSION_SECRET in .env
   nano .env                        # set SKY_SESSION_SECRET (required). Model key optional
                                    # here — you can paste it on the setup screen instead.
   ```

4. **Run:**

   ```bash
   docker compose up --build -d     # -d = background
   docker compose logs -f app       # watch it come up
   ```

   The app is on port 3000. Point a load balancer or a reverse proxy (Caddy/Nginx) at it
   for TLS on 443, or open 3000 directly for a quick trial.

**Notes**
- **Database:** compose runs Postgres in a container with a persistent volume. For real
  production use **AWS RDS** instead: create a Postgres instance, put its URL in
  `DATABASE_URL`, and delete the `db` service from `docker-compose.yml`.
- **TLS:** simplest is Caddy in front (`caddy reverse-proxy --to :3000`), which gets a
  Let's Encrypt cert automatically for your domain.

---

## 4. Run it on AWS (ECS Fargate + RDS — managed)

For teams that want no VM to babysit. Higher-level; you'll use your normal IaC.

- **Database:** an **RDS for PostgreSQL** instance. Its endpoint → `DATABASE_URL`.
- **App:** build the image (`docker build -t neo-ce .`), push to **ECR**, run it as an
  **ECS Fargate** service behind an **ALB** (target port 3000). Attach a **task role** with
  `bedrock:InvokeModel` if you're using Bedrock.
- **Migrations:** run `node scripts/ce-migrate.mjs` once as a one-off ECS task (or a
  release step) against the RDS `DATABASE_URL` before the first deploy.
- **Job runner:** run a second small container from `inngest/inngest` as a sidecar/service
  (`inngest dev -u http://<app>:3000/api/inngest`), and set `INNGEST_DEV` on the app to its
  URL. (See `docker-compose.yml` for the exact command the bundled runner uses.)

Config is all environment variables — the same `.env` keys, set on the task definition.

---

## 5. First run

1. Open the app (`http://<host>:3000`).
2. The first visit routes to **Sign up** — create the first account. With built-in auth
   that account is your admin; there's no external identity service to configure.
3. You land on a **setup screen** that live-checks Database, Background jobs, and your
   Model provider. If the model check is red (no key set in `.env`), a **"Paste your
   Anthropic key"** field appears right there — paste it and it's stored encrypted for
   your org; click Re-check and it goes green. No `.env` edit, no restart.
4. **Add a use case**, set its **technology stack**, and run the engine: Classify → Risk
   Tier → Controls → Evidence → Assurance → Decision, then Red Team and the report.

Want your team's SSO instead of passwords? Set the `NEO_CE_OIDC_*` vars in `.env`.

---

## 6. Troubleshooting

- **`401 invalid x-api-key` / assessments fail immediately** — the model key is missing,
  wrong, or out of credit. Re-check `ANTHROPIC_API_KEY` (or the Bedrock block) and that the
  process actually has it (`docker compose` reads the `.env` next to it).
- **Assessments stay "pending"** — the job runner isn't reachable. In compose it's built in;
  running the app directly, start it: `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`.
- **Controls stage is slow / rate-limited** — a low-tier key gets throttled by parallel
  calls. Lower `CONTROLS_CONCURRENCY` (try `1`) in `.env`.
- **Bedrock: `AccessDenied` or model-not-found** — you haven't enabled the Claude models in
  that region (Bedrock → Model access), the role lacks `bedrock:InvokeModel`, or the
  `BEDROCK_MODEL_*` ids don't match your region's inference-profile ids.
- **`column ... does not exist`** — migrations didn't all run. Re-run `npm run db:migrate`
  (or `node scripts/ce-migrate.mjs`) against your `DATABASE_URL`.

Questions or issues: open one on the GitHub repo.
