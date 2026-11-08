-- Sending from the wedding's own address: emails sent from the app are kept with the ones that came in
-- (direction 'out', who they went to, and the email they answer). Guests can have an email on their
-- invitation, for emailing them their invitation link and knowing who wrote in.
ALTER TABLE inbox_email ADD COLUMN direction TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out'));
ALTER TABLE inbox_email ADD COLUMN to_addr TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox_email ADD COLUMN in_reply_to TEXT;
ALTER TABLE invitation ADD COLUMN email TEXT;
