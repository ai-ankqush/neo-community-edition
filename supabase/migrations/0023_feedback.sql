-- 0023: beta feedback captured from the Ask Neo "Feedback" tab. Surfaced in
-- /admin/feedback. Append-only.

create table if not exists feedback (
  id         bigint generated always as identity primary key,
  org_id     uuid references organizations(id) on delete set null,
  actor      text,                 -- clerk user id
  message    text not null,
  page       text,                 -- path the user was on
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on feedback (created_at desc);
