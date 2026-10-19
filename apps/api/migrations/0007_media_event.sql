-- Photos belong to an event (the wedding's album and the birthday's are kept apart).
-- NULL: added before events had their own photo pages (shown under every event).
ALTER TABLE media ADD COLUMN event_key TEXT;
CREATE INDEX media_event ON media (wedding_id, event_key);
