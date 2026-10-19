-- The message board: a public wall on the guests' pages where guests post messages of support, heart
-- each other's posts, and the couple replies, pins, approves or hides. Settings (on/off, approval) live
-- in wedding.content.board.
CREATE TABLE board_post (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  invitation_id TEXT,                                       -- NULL: posted by the couple
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  parent_id TEXT,                                           -- a reply to this post
  status TEXT NOT NULL DEFAULT 'shown' CHECK (status IN ('shown', 'pending', 'hidden')),
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX board_post_wedding ON board_post (wedding_id, created_at);

CREATE TABLE board_like (
  post_id TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, invitation_id)
);
