-- Messages between guests and the couple (Account → Messages): support, questions and the couple's
-- replies, one conversation per invitation. RSVP notes and texted questions are shown in the same
-- conversation straight from rsvp / sms_in, so they aren't copied here.
CREATE TABLE message (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  from_guest INTEGER NOT NULL,                              -- 1: the guest wrote it; 0: the couple
  kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'support', 'question')),
  body TEXT NOT NULL,
  sent_sms INTEGER NOT NULL DEFAULT 0,                      -- the couple's reply also went out as a text
  created_at TEXT NOT NULL,
  read_at TEXT                                              -- guest messages: when the couple read it; replies: when the guest saw it
);
CREATE INDEX message_thread ON message (wedding_id, invitation_id, created_at);
