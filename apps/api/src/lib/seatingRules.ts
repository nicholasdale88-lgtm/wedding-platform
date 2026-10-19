/**
 * Seating follows the replies: a seat at an event's tables needs a "yes" for that event. Anyone on
 * this invitation who has declined, gone back to awaiting, or is no longer invited loses their seat.
 * Added to the same batch as the reply or invite change, after it, so the two can never disagree.
 */
export const unseatIfNotComing = (db: D1Database, invitationId: string): D1PreparedStatement =>
  db
    .prepare(
      `UPDATE person SET table_id = NULL
        WHERE invitation_id = ?1 AND table_id IS NOT NULL
          AND table_id IN (
            SELECT t.id FROM seat_table t
             WHERE t.event_id NOT IN (
               SELECT r.event_id FROM rsvp r JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
                WHERE r.invitation_id = ?1 AND r.attending = 1))`,
    )
    .bind(invitationId);

/** The same rule for a whole event's plan (used when seating is saved). */
export const unseatEveryoneNotComing = (db: D1Database, eventId: string): D1PreparedStatement =>
  db
    .prepare(
      `UPDATE person SET table_id = NULL
        WHERE table_id IN (SELECT id FROM seat_table WHERE event_id = ?1)
          AND invitation_id NOT IN (
            SELECT r.invitation_id FROM rsvp r JOIN invite_event ie ON ie.invitation_id = r.invitation_id AND ie.event_id = r.event_id
             WHERE r.event_id = ?1 AND r.attending = 1)`,
    )
    .bind(eventId);
