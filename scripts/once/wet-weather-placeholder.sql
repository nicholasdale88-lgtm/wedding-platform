-- One-time (2026-10-19): a placeholder wet-weather plan on the wedding's night-before guide, for the
-- couple to edit in Setup → Night-before page. Only fills it when empty, then marks itself done.

UPDATE wedding
   SET guide = json_set(guide, '$.wedding.wetPlan',
         'Placeholder, to confirm with Glenworth Valley: if it rains, the ceremony moves undercover to the Valley Events Centre at the same time, 2:00pm. Park at the Events Centre instead of The Lookout and follow the signs inside. Bring an umbrella for the walk from the car. We will text everyone by 10:00am on the day if we switch to the wet-weather plan.'),
       version = version + 1
 WHERE slug = 'sophie-and-nicholas'
   AND json_valid(guide)
   AND json_type(guide, '$.wedding') = 'object'
   AND COALESCE(json_extract(guide, '$.wedding.wetPlan'), '') = ''
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'guide.wet-placeholder');

INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at)
SELECT lower(hex(randomblob(16))), id, NULL, 'guide.wet-placeholder', id, 'Night-before guide: placeholder wet-weather plan', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM wedding WHERE slug = 'sophie-and-nicholas'
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'guide.wet-placeholder');
