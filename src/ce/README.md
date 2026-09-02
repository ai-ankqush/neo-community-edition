# Neo Community Edition (gated)

Community Edition is the **same product** with five paid modules hidden. It is not a
fork: the whole app runs, and the modules are gated by a single env flag so every
page and its 300+ internal links work unchanged. Production (`NEO_EDITION` unset)
is byte-for-byte identical.

## The flag
`NEO_EDITION=community` (unset / anything else = full enterprise). Read via
[`edition.ts`](./edition.ts).

## What it hides (the paid five)
Supply Chain (+ AI-BOM), Vendor Reviews, Red Team, Action Fabric / PAL, Shadow AI.
Hidden from the sidebar + mobile nav, redirected at the route layer, and their APIs
return 404 — all in `src/middleware.ts` and the `community` prop threaded from
`src/app/dashboard/layout.tsx` into `Sidebar` / `MobileNav`.

Everything else is untouched: Use Cases, Controls (+ Evidence/Assurance + the
compliance-framework crosswalks), Heatmap, Decision, Control Graph, Build & Deploy,
Reports/Executive, Integrations, Settings. Model key defaults to BYO.

## Files this touches (all gated by `community`, inert in production)
- `src/ce/edition.ts` (new) — the flag + the blocked page/API lists.
- `src/middleware.ts` — blocks the five routes/APIs when community.
- `src/app/dashboard/layout.tsx` — forces the show-flags off + BYO on when community.
- `src/components/console/sidebar.tsx`, `mobile-nav.tsx` — drop Red Team + Shadow AI links when community.

## How to reach it — no second project, no env copying
Community Edition is served by the **same production deployment** (same DB, same env),
gated per viewer by a cookie:

- Visit **`/neo-ce-gated`** → sets the `neo_edition=community` cookie and drops you into
  `/dashboard` in the cut-down edition. A "Community Edition preview · Exit" pill appears
  in the header.
- Visit **`/neo-ce-gated/exit`** (or click the pill) → clears the cookie, back to full Neo.

No cookie = the full product, unchanged. So one deploy of `main` makes it live at
`app.neocontrol.ai/neo-ce-gated`.

**Alternative — a fully-community deployment:** set `NEO_EDITION=community` as an env var
and the whole deployment is Community Edition (no cookie needed). Use this when you later
want a dedicated CE host; not needed for previewing on production.

Gating is intentionally open right now (any signed-in viewer can enter the preview). Lock
it to an allowlist before it's public.

## Not done yet (after you've tested the cut)
- Access model for who can reach CE (open self-serve vs invite) — needs your call.
- Whether CE users are a separate cohort (own orgs/quota) or the same accounts.
- The public open-source repo: physically remove the five module folders + swap Clerk
  for the built-in RBAC / BYO-IdP seam (`resolvePrincipal`). Separate step.
