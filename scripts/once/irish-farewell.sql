-- One-time (2026-10-19): the couple asked for the last timeline entry to read "Irish farewell".
-- Changes the invitation's timeline title and the matching FAQ schedule line, then marks itself done
-- so a later edit in Guest pages → Wording is never overwritten.

UPDATE wedding
   SET content = json_set(json_set(content, '$.texts."inv.7281f143"', 'Irish farewell'), '$.texts."inv.e5b9de9b"', '11:00pm: Irish farewell'),
       version = version + 1
 WHERE slug = 'sophie-and-nicholas'
   AND json_valid(content)
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'wording.irish-farewell');

INSERT INTO audit (id, wedding_id, user_id, action, target, detail, at)
SELECT lower(hex(randomblob(16))), id, NULL, 'wording.irish-farewell', id, 'Timeline: Farewell → Irish farewell', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM wedding WHERE slug = 'sophie-and-nicholas'
   AND NOT EXISTS (SELECT 1 FROM audit WHERE action = 'wording.irish-farewell');
