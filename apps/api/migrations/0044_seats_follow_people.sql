-- Invitations whose seats held stayed at 1 after more people were added to them: hold a seat for each person.
-- data-safe: only raises seats_held to the number of people on the invitation; no rows are removed or lowered.
UPDATE invitation SET seats_held = (SELECT COUNT(*) FROM person p WHERE p.invitation_id = invitation.id AND p.deleted_at IS NULL)
 WHERE deleted_at IS NULL AND seats_held < (SELECT COUNT(*) FROM person p WHERE p.invitation_id = invitation.id AND p.deleted_at IS NULL);
