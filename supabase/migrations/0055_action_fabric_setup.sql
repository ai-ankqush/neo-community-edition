-- AI Action Fabric — per-org setup & consent state.
-- Drives the guided checklist and the PDP-default / PEP-opt-in gating.
-- Enabling AF is its own deliberate, recorded act — never inherited from the
-- read-only verification connectors set up during a use-case assessment.
--   pdp = decision point (observe/judge; low risk) — light acknowledgment.
--   pep = enforcement point (in the path; can block/hold live actions) — strictly
--         opt-in, heavier acknowledgment, recorded for the audit trail.

create table if not exists action_fabric_setup (
  org_id              uuid primary key references organizations(id) on delete cascade,
  pdp_acked_at        timestamptz,   -- decision-point enabled (light ack)
  pdp_acked_by        text,
  pep_opted_in_at     timestamptz,   -- enforcement opt-in (heavy risk ack)
  pep_acked_by        text,
  terms_version       text,          -- which consent text they accepted
  soc_forward_enabled boolean not null default false,  -- forward Observe findings to SOC (flag; forwarder is a later build)
  updated_at          timestamptz not null default now()
);

alter table action_fabric_setup enable row level security;
-- Deny-all to anon/authenticated; the app reaches this only via the service role.
