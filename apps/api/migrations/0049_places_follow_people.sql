-- An invitation holds at least a place for each person named on it (older invitations, and people added from
-- the wedding party page, could hold fewer, so the guest list counted fewer guests than seating). Only raises.
-- data-safe: only raises seats_held to the number of people already named on the invitation (never lowers or deletes anything); the old value was below the names it held, so nothing is lost.
UPDATE invitation
   SET seats_held = (SELECT COUNT(*) FROM person p WHERE p.invitation_id = invitation.id AND p.deleted_at IS NULL AND trim(p.name) != '')
 WHERE deleted_at IS NULL
   AND seats_held < (SELECT COUNT(*) FROM person p WHERE p.invitation_id = invitation.id AND p.deleted_at IS NULL AND trim(p.name) != '');
