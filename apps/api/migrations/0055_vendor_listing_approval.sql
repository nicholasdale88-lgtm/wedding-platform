-- New self-serve vendor listings wait for approval before couples can find them in the directory.
-- approved_at NULL = waiting (not in the directory, its page, enquiries or the planner's finder);
-- every listing that existed before this is approved as of when it was made.
ALTER TABLE vendor_listing ADD COLUMN approved_at TEXT;
-- data-safe: only fills the column added just above (NULL everywhere until now); no existing value is changed or removed.
UPDATE vendor_listing SET approved_at = created_at;
