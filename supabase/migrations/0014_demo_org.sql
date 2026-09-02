-- 0014: demo organizations. A demo org behaves like Enterprise (unlimited use
-- cases, all features, no trial gate) and is excluded from billing. Used for the
-- internal Neo workspace so we can add users and run live demos without limits.

alter table organizations add column if not exists is_demo boolean not null default false;

-- Mark the internal Neo workspace as a demo + give it Enterprise capabilities.
-- Adjust the name match if the workspace is named differently.
update organizations
   set is_demo = true,
       plan = 'enterprise'
 where name ilike 'neo%';
