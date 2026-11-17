-- The wedding party portal: sign in with a mobile as well as (or instead of) an email. New column only.
ALTER TABLE party_account ADD COLUMN phone TEXT;
CREATE UNIQUE INDEX party_account_phone ON party_account (wedding_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
