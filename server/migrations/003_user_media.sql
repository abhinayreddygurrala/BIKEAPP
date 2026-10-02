-- Photos and receipts backed up to Cloud Storage. The files themselves live
-- in the bucket (users/<user id>/<path>); this table is the index of what
-- each account has there and how big it is, for listing on restore and for
-- the per-account and whole-bucket size caps that keep storage in the free tier.

CREATE TABLE user_media (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, path)
) WITHOUT ROWID;
