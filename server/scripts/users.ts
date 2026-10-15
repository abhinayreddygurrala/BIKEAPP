// Lists every account next to its folder in the photo bucket (users/<id>/),
// so a folder there can be matched to a person. Opens the database read-only
// and never prints password hashes.
//
//   npm run users                                  this server's own database
//   npm run users -- path/to/odomap.db             a copy on disk
//   npm run users -- gs://<bucket>/backups/odomap-2026-10-15.db
//                                                  a nightly backup, fetched with gcloud and then deleted
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from '../src/config.js';

type Row = {
  id: string;
  username: string;
  email: string;
  phone: string;
  created_at: string;
  last_seen: number | null;
  files: number;
  bytes: number;
  records: number;
};

const source = process.argv[2] ?? config.databasePath;
let file = source;
let tempDir: string | undefined;
if (source.startsWith('gs://')) {
  tempDir = mkdtempSync(path.join(tmpdir(), 'odomap-users-'));
  file = path.join(tempDir, 'odomap.db');
  execFileSync('gcloud', ['storage', 'cp', source, file], { stdio: ['ignore', 'ignore', 'inherit'] });
}

try {
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.phone, u.created_at,
              (SELECT max(last_used_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen,
              (SELECT count(*) FROM user_media m WHERE m.user_id = u.id) AS files,
              (SELECT coalesce(sum(size), 0) FROM user_media m WHERE m.user_id = u.id) AS bytes,
              (SELECT count(*) FROM user_records r WHERE r.user_id = u.id) AS records
       FROM users u
       ORDER BY u.created_at`
    )
    .all() as Row[];
  db.close();

  console.table(
    rows.map((r) => ({
      username: r.username,
      email: r.email,
      phone: r.phone,
      joined: r.created_at.slice(0, 10),
      'last seen': r.last_seen ? new Date(r.last_seen).toISOString().slice(0, 10) : '-',
      files: r.files,
      MB: Number((r.bytes / 1024 / 1024).toFixed(1)),
      records: r.records,
      'bucket folder': `users/${r.id}/`,
    }))
  );
  console.log(`${rows.length} account${rows.length === 1 ? '' : 's'} in ${source}`);
} finally {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}
