-- Meals per person per event: someone at the wedding and the 30th can have a different meal at each.
-- A guest is given a special menu by its id (so editing the menu reaches everyone on it); a course can be
-- changed just for them. No row (or menu '' with no courses) is the set menu.
CREATE TABLE meal_choice (
  person_id  TEXT NOT NULL REFERENCES person(id),
  event_id   TEXT NOT NULL REFERENCES event(id),
  menu_id    TEXT NOT NULL DEFAULT '',
  entree     TEXT NOT NULL DEFAULT '',
  main       TEXT NOT NULL DEFAULT '',
  dessert    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (person_id, event_id)
);
CREATE INDEX meal_choice_event ON meal_choice (event_id);

-- Meals already written were for the first event: carry them over as that event's choice.
INSERT INTO meal_choice (person_id, event_id, entree, main, dessert, updated_at)
SELECT p.id,
       (SELECT e.id FROM event e WHERE e.wedding_id = i.wedding_id AND e.deleted_at IS NULL ORDER BY e.sort, e.starts_at LIMIT 1),
       p.meal_entree, p.meal_main, p.meal_dessert, '2026-10-20T00:00:00.000Z'
  FROM person p JOIN invitation i ON i.id = p.invitation_id
 WHERE (p.meal_entree <> '' OR p.meal_main <> '' OR p.meal_dessert <> '')
   AND EXISTS (SELECT 1 FROM event e WHERE e.wedding_id = i.wedding_id AND e.deleted_at IS NULL);
