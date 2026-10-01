-- Accounts and login sessions (SQLite).
--
-- Uniqueness is enforced by the database, not just by checking first: two
-- people signing up at the same instant with the same username can't both win.
-- Usernames are unique case-insensitively ("Rider" and "rider" are the same
-- name) while keeping the capitalisation the person chose for display.
-- Emails are stored lowercased; phones are stored in E.164 (+15015551234).
-- Times are ISO-8601 text for users and Unix milliseconds for sessions (the
-- session columns are compared numerically on every request).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX users_email_idx ON users (email);
CREATE UNIQUE INDEX users_phone_idx ON users (phone);

-- Opaque session tokens. Only a SHA-256 hash of each token is stored, so a
-- database leak can't be replayed as live logins. Deleting a user removes all
-- of their sessions.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
