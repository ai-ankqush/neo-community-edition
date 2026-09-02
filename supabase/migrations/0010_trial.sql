-- 0010: free trial. New orgs start on a 14-day full-feature trial; when it
-- expires they must choose a plan before they can keep using the portal.

alter table organizations add column if not exists trial_ends_at timestamptz;

-- migrate any legacy 'free' orgs onto the trial, with a 14-day window from signup
update organizations set plan = 'trial' where plan = 'free';
update organizations
  set trial_ends_at = created_at + interval '14 days'
  where plan = 'trial' and trial_ends_at is null;
