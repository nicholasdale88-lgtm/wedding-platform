-- An automatic reply for guests who say no to everything ("we'll miss you"), instead of the thank-you
-- that says "we can't wait to celebrate with you". On when the thank-you is on; the couple can edit it.
INSERT INTO campaign (id, wedding_id, key, name, body, mode, enabled, trigger, audience, excluded, sort)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       w.id, 'thanksNo', 'Sorry you can''t make it',
       'Thanks for letting us know, {first}. We''ll miss you! If anything changes before the RSVP date, you can update your reply here: {link}',
       'auto', COALESCE((SELECT c.enabled FROM campaign c WHERE c.wedding_id = w.id AND c.key = 'thanks' AND c.deleted_at IS NULL), 0),
       'rsvp_changed', '{"declinedAll":true}', '[]', 1
  FROM wedding w
 WHERE NOT EXISTS (SELECT 1 FROM campaign c WHERE c.wedding_id = w.id AND c.key = 'thanksNo');
