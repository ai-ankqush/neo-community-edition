-- 0028: business function (owner department) on vendor reviews, mirroring the
-- use-case business_function (IT, HR, Legal, …) so reviews share the same taxonomy.
alter table vendor_reviews add column if not exists business_function text;
