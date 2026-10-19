-- "How well do you know the couple?": each guest's answers and score (the questions are a planner document).
CREATE TABLE quiz_answer (
  wedding_id    TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  answers       TEXT NOT NULL,
  score         INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (wedding_id, invitation_id)
);
CREATE INDEX quiz_answer_score ON quiz_answer (wedding_id, score DESC, created_at);
