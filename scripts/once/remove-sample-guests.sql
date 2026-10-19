-- One-time (2026-10-19): remove the design prototype's sample guests from the live wedding.
-- They all share the seed's creation time; guests added later in the admin are never touched.
-- Invitations are soft-deleted (recoverable); their fake text history is removed.
-- Runs once: the audit marker at the end stops it from running again.

DELETE FROM seat
 WHERE person_id IN (
   SELECT p.id FROM person p JOIN invitation i ON i.id = p.invitation_id JOIN wedding w ON w.id = i.wedding_id
    WHERE w.slug = 'sophie-and-nicholas' AND i.created_at = (SELECT MIN(created_at) FROM invitation WHERE wedding_id = w.id))
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'cleanup.sample-guests');

UPDATE person SET table_id = NULL
 WHERE invitation_id IN (
   SELECT i.id FROM invitation i JOIN wedding w ON w.id = i.wedding_id
    WHERE w.slug = 'sophie-and-nicholas' AND i.created_at = (SELECT MIN(created_at) FROM invitation WHERE wedding_id = w.id))
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'cleanup.sample-guests');

DELETE FROM sms_out
 WHERE invitation_id IN (
   SELECT i.id FROM invitation i JOIN wedding w ON w.id = i.wedding_id
    WHERE w.slug = 'sophie-and-nicholas' AND i.created_at = (SELECT MIN(created_at) FROM invitation WHERE wedding_id = w.id))
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'cleanup.sample-guests');

DELETE FROM sms_in
 WHERE invitation_id IN (
   SELECT i.id FROM invitation i JOIN wedding w ON w.id = i.wedding_id
    WHERE w.slug = 'sophie-and-nicholas' AND i.created_at = (SELECT MIN(created_at) FROM invitation WHERE wedding_id = w.id))
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'cleanup.sample-guests');

UPDATE invitation SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1
 WHERE wedding_id = (SELECT id FROM wedding WHERE slug = 'sophie-and-nicholas')
   AND deleted_at IS NULL
   AND created_at = (SELECT MIN(created_at) FROM invitation WHERE wedding_id = (SELECT id FROM wedding WHERE slug = 'sophie-and-nicholas'))
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'cleanup.sample-guests');

INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at)
SELECT lower(hex(randomblob(16))), id, NULL, 'cleanup.sample-guests', id, 'Sample guests from the design prototype removed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM wedding WHERE slug = 'sophie-and-nicholas'
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'cleanup.sample-guests');
