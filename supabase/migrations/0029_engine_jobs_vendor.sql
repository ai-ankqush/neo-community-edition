-- 0029: let engine_jobs (the notifications feed) reference a vendor review, so a
-- Vendor AI Review evaluation shows in the bell and links back to the review.
alter table engine_jobs add column if not exists vendor_review_id uuid references vendor_reviews(id) on delete cascade;
