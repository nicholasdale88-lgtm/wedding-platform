-- When the emails (and the couple's own-phone texts) for a dated send were built. Until then the wedding is
-- near the front of the cron's queue; afterwards it waits its turn, so weddings whose message already went
-- out don't keep taking the places of weddings still waiting (the cron visits 40 weddings a run).
ALTER TABLE campaign_slot ADD COLUMN mail_built_at TEXT;
