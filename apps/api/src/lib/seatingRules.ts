/**
 * Seating follows the replies: a seat at an event's tables needs a "yes" for that event. Anyone on
 * this invitation who has declined, gone back to awaiting, or is no longer invited loses their seat.
 * Added to the same batch as the reply or invite change, after it, so the two can never disagree.
 */
export const unseatIfNotComing = (db: D1Database, invitationId: string): D1PreparedStatement =>
  db
    .prepare(
      `DELETE FROM seat
        WHERE person_id IN (SELECT id FROM person WHERE invitation_id = ?1)
          AND event_id NOT IN (
            SELECT r.event_id FROM rsvp r JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
             WHERE r.invitation_id = ?1 AND r.attending = 1)`,
    )
    .bind(invitationId);

/** The same rule for a whole event's plan (used when seating is saved). */
export const unseatEveryoneNotComing = (db: D1Database, eventId: string): D1PreparedStatement =>
  db
    .prepare(
      `DELETE FROM seat
        WHERE event_id = ?1
          AND person_id NOT IN (
            SELECT p.id FROM person p JOIN rsvp r ON r.invitation_id = p.invitation_id
              JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
             WHERE r.event_id = ?1 AND r.attending = 1)`,
    )
    .bind(eventId);

/**
 * Not coming to anything: once a guest has declined every event they're invited to, their dietary
 * notes and meals are cleared, so no caterer list or count includes them. (If they change to yes,
 * the RSVP form asks again.)
 */
export const clearDietIfDeclinedAll = (db: D1Database, invitationId: string): D1PreparedStatement =>
  db
    .prepare(
      `UPDATE person SET diet = '', meal_entree = '', meal_main = '', meal_dessert = ''
        WHERE invitation_id = ?1
          AND EXISTS (SELECT 1 FROM invite_event WHERE invitation_id = ?1)
          AND NOT EXISTS (
            SELECT 1 FROM invite_event ie LEFT JOIN rsvp r ON r.invitation_id = ie.invitation_id AND r.event_id = ie.event_id
             WHERE ie.invitation_id = ?1 AND (r.attending IS NULL OR r.attending = 1))`,
    )
    .bind(invitationId);
