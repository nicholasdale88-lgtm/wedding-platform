-- A postal address per invitation (household), for printed invitations, and how the invitation reaches
-- them: 'digital' (text or email, as now), 'post' (printed only: nothing digital is sent) or 'both'.
-- New columns with defaults only; nothing existing changes.
ALTER TABLE invitation ADD COLUMN address_street TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN address_suburb TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN address_state TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN address_postcode TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN address_country TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN delivery TEXT NOT NULL DEFAULT 'digital';
