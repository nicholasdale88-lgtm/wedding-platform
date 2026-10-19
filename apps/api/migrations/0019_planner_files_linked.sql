-- Planning files (quotes, contracts, menus) can live in the couple's linked Google Drive, Dropbox or
-- OneDrive instead of the site's database: then `remote` is "link:<link id>:<the provider's id>" and
-- `data` is empty.
ALTER TABLE planner_file ADD COLUMN remote TEXT;
