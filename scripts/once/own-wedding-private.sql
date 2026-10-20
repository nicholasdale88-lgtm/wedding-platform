-- The platform's own wedding is private: its pages open only with each guest's own link (or for the
-- couple, signed in). Runs on every deploy; only sets it the first time, so the couple can switch it off.
UPDATE wedding SET content = json_set(content, '$.private', json('true'), '$.privateSet', json('true'))
 WHERE slug = 'sophie-and-nicholas' AND json_valid(content) AND json_extract(content, '$.privateSet') IS NULL;
