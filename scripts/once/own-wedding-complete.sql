-- The platform's own wedding has every feature, whatever the plans say (safe to run on every deploy).
UPDATE wedding SET plan = 'complete' WHERE slug = 'sophie-and-nicholas' AND plan != 'complete';
-- ...and room for its extra events (a recovery brunch, welcome drinks) without the add-on.
UPDATE wedding SET content = json_set(content, '$.extraEvents', 10)
 WHERE slug = 'sophie-and-nicholas' AND json_valid(content) AND COALESCE(json_extract(content, '$.extraEvents'), 0) < 10;
