-- The platform's own wedding: Married by the Beard is the couple's celebrant, DJ and MC (booked).
-- Added to Planner → Vendors once; does nothing if a vendor by that name is already there. Safe on every deploy.

-- No vendor list yet: start one with them.
INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at)
SELECT w.id, 'vendors', '',
       json_object('list', json_array(json('{"id":"v-married-by-the-beard","name":"Married by the Beard","category":"Celebrant, DJ and MC","status":"booked","notes":"Our celebrant, and also our DJ and MC on the day."}')), 'rfqs', json_array()),
       1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM wedding w
 WHERE w.slug = 'sophie-and-nicholas'
   AND NOT EXISTS (SELECT 1 FROM planner_doc d WHERE d.wedding_id = w.id AND d.kind = 'vendors' AND d.scope = '');

-- A list already: add them to the end of it (unless they're on it).
UPDATE planner_doc
   SET data = json_set(data, '$.list', json_insert(COALESCE(json_extract(data, '$.list'), '[]'), '$[#]', json('{"id":"v-married-by-the-beard","name":"Married by the Beard","category":"Celebrant, DJ and MC","status":"booked","notes":"Our celebrant, and also our DJ and MC on the day."}'))),
       version = version + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE kind = 'vendors' AND scope = ''
   AND wedding_id = (SELECT id FROM wedding WHERE slug = 'sophie-and-nicholas')
   AND json_valid(data)
   AND NOT EXISTS (SELECT 1 FROM json_each(planner_doc.data, '$.list') WHERE lower(json_extract(value, '$.name')) LIKE '%married by the beard%');
