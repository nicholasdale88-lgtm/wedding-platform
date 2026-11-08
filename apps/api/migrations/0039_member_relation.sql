-- Who each person helping run a wedding is to the couple (partner, family, wedding planner, celebrant,
-- venue, wedding party, friend, vendor): shown beside their name, and how the company finds planners and
-- celebrants who already use the app.
ALTER TABLE membership ADD COLUMN relation TEXT NOT NULL DEFAULT '';
ALTER TABLE member_invite ADD COLUMN relation TEXT NOT NULL DEFAULT '';
