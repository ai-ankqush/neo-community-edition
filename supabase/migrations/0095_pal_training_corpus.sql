-- 0095_pal_training_corpus.sql
-- Closing the learning loop: capture.
--
-- PAL as deployed is a FROZEN model — inference only, `modelVersion` never changes at runtime. The
-- co-evolution that produced it (Red invents, Blue learns, Red adapts) ran offline in BlackC and was exported
-- to JSON weights. Nothing the model discovers in production currently makes it smarter. This table is the
-- missing half: every discovery, every live-fire outcome, every human ruling becomes a LABELLED example, so
-- the next BlackC retrain learns from what PAL actually met in the world.
--
-- Heavy learning stays offline (numpy co-evolution cannot and should not run in a web request). This is the
-- capture side of: capture (here) -> retrain (BlackC) -> redeploy (new weights, bumped modelVersion).

create table if not exists pal_training_examples (
  example_id     uuid primary key default gen_random_uuid(),
  captured_at    timestamptz not null default now(),

  -- provenance
  source         text not null,          -- hunt | generator | live_fire | human_ruling | decision_outcome
  target_id      uuid references pal_targets(target_id) on delete set null,
  finding_id     uuid references pal_findings(finding_id) on delete set null,

  -- the example itself: the model's input space, so a retrain can consume it directly
  features       jsonb not null,         -- { action: {...}, context: {...} } in PAL's 18-feature space
  tool_chain     jsonb not null default '[]'::jsonb,  -- the tool names composing this example

  -- what the model said at capture time
  model_version  text,
  model_score    numeric,                -- the frozen model's hostility probability
  model_hostile  boolean,

  -- the LABEL — what was actually true. This is the learning signal.
  label          text,                   -- hostile | benign | unknown
  label_source   text,                   -- model_only | live_fire_confirmed | human_confirmed | gravity_held
  -- did reality agree with the model? null until a label lands.
  agreed         boolean,

  notes          text
);
create index if not exists pal_training_examples_idx on pal_training_examples(captured_at desc);
create index if not exists pal_training_examples_label_idx on pal_training_examples(label, source);
alter table pal_training_examples enable row level security;  -- deny-all; service role only

comment on table pal_training_examples is
  'Labelled examples captured from live PAL activity, in the model''s own feature space, for the next offline co-evolution retrain. `agreed` records whether reality matched the frozen model — the disagreements are the most valuable training signal (what the model missed or over-called).';
