/**
 * SQL for "a real invitation" (alias i): one with a name, a mobile or an email. A blank one (started with Add
 * guest, never filled in) isn't a guest: the guest list hides it and no figure counts it (shared/counts isBlankGuest).
 */
export const REAL_INVITATION = `(EXISTS (SELECT 1 FROM person bp WHERE bp.invitation_id = i.id AND bp.deleted_at IS NULL AND trim(bp.name) != '') OR trim(COALESCE(i.phone, '')) != '' OR trim(COALESCE(i.email, '')) != '')`;

/** SQL for the guests an invitation (alias i) counts as: its places held, and at least one for each person named (shared/counts placesOf). */
export const PLACES = `MAX(1, i.seats_held, (SELECT COUNT(*) FROM person np WHERE np.invitation_id = i.id AND np.deleted_at IS NULL AND trim(np.name) != ''))`;
