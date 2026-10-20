-- The platform's own wedding has every feature, whatever the plans say (safe to run on every deploy).
UPDATE wedding SET plan = 'complete' WHERE slug = 'sophie-and-nicholas' AND plan != 'complete';
