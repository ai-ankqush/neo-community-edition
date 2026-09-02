# Contributing to Neo Community Edition

Thanks for helping build open AI governance. Neo CE is the open core of
[Neo Control](https://neocontrol.ai); contributions here improve the assessment
and control engine everyone self-hosts.

## Ground rules

- **Scope:** CE covers classify/tier, control selection, evidence/verification,
  red-team, and framework crosswalks. The paid modules (AI Supply Chain, Vendor
  Risk, Action Fabric, Shadow AI) live in the hosted product and are out of scope
  for PRs here.
- **License:** by contributing you agree your contribution is licensed under
  AGPL-3.0-or-later. Don't paste proprietary or copyrighted code.
- **No secrets:** never commit `.env`, keys, tokens, or customer data. The repo
  ships schema and an anonymised sample seed only.

## Getting set up

```bash
cp .env.example .env      # SKY_SESSION_SECRET, DATABASE_URL, a model key
npm install
npm run db:migrate
npm run dev
```

## Making a change

1. Open an issue or a Discussion first for anything non-trivial.
2. Branch from `main`, keep PRs focused.
3. `npm run build` and `npm run lint` must pass; add/adjust tests where relevant.
4. Describe the change and how you verified it.

## Framework crosswalks

Always keep the full set consistent: NIST AI RMF, ISO 42001, EU AI Act, OWASP,
SR 11-7, and NYDFS Part 500. Don't drop the financial-services two.

## Security

Report vulnerabilities privately to neo@neocontrol.ai — don't open a public issue.

## Governance

Neo Control maintains CE and reviews contributions. We aim to be responsive and
transparent about what fits the open core versus the commercial product.
