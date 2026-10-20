-- 2026-10-20: the RSVP thank-you said guests could change their reply "any time"; replies close on the
-- RSVP date, so it now says until when ({rsvp_by}). Only the wording as it was set up; a couple's own edit stays.
UPDATE campaign SET body = 'Thanks {first}, we have your RSVP. We can''t wait to celebrate with you. You can change your reply until {rsvp_by}: {link}', version = version + 1
 WHERE body = 'Thanks {first}, we have your RSVP. We can''t wait to celebrate with you. Change your reply any time: {link}';
