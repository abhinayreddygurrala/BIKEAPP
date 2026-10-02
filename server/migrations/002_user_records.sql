-- Cloud backup of each rider's on-phone data (bikes, rides, ride GPS points,
-- maintenance, fuel, expenses, settings). The phone stays the main copy; this
-- is what a new phone restores from. Each record is the phone's row as JSON,
-- so new columns on the phone back up without a server change. Deleting the
-- account deletes all of it.

CREATE TABLE user_records (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, record_id)
) WITHOUT ROWID;
