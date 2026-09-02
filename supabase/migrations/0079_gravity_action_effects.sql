-- 0079_gravity_action_effects.sql
-- Neo Gravity — real mediated-write target.
--
-- Proof that Gravity mediates a REAL action, not a simulation: when a governed executor performs a
-- side-effecting write, the effect lands here, attributed to the VERIFIED principal (subject + idp) and
-- bound to the originating decision. A row can only exist if the gate said allow, a single-use
-- authorization was issued, the executor confirmed the acting identity matched that authorization, and
-- then consumed it. Identity is enforced at the point of action, not just at the API edge.

create table if not exists gravity_action_effects (
  effect_id   uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  decision_id uuid not null,            -- the gate decision that authorized this
  actor       text not null,            -- verified neutral subject id
  idp         text not null,            -- provenance of the verified identity ('clerk' | 'oidc:<issuer>')
  resource    text not null,
  action      text not null,
  effect      jsonb not null,           -- what actually changed (reversible payload)
  created_at  timestamptz not null default now()
);
create index if not exists gravity_action_effects_org_idx on gravity_action_effects(org_id, created_at desc);
create index if not exists gravity_action_effects_decision_idx on gravity_action_effects(decision_id);
alter table gravity_action_effects enable row level security;  -- deny-all; service role only
