import { Directory, File, Paths, UploadType } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { ApiError } from '@/lib/apiClient';
import { getDb } from '@/lib/localDb';

import type { AuthedRequest } from './cloudSync';

// Photos and receipts go straight between the phone and Google Cloud Storage
// using short-lived links from the Odomap server; the server never carries
// the files themselves. Paths are relative to the phone's documents folder
// (photos/bikes/<id>.jpg, photos/avatar/avatar.jpg,
// attachments/maintenance/<id>.jpg|pdf), so a restore puts each file back
// exactly where the app looks for it.

export type MediaResult = 'done' | 'full' | 'unavailable';

async function ensureMediaTable(db: SQLiteDatabase) {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS media_state (path TEXT PRIMARY KEY, signature TEXT NOT NULL);'
  );
}

/** Every file the phone's records point at. */
async function referencedPaths(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ path: string }>(`
    SELECT 'photos/bikes/' || photo_filename AS path FROM bikes_local WHERE photo_filename IS NOT NULL
    UNION SELECT 'photos/avatar/' || avatar_filename FROM settings_local WHERE avatar_filename IS NOT NULL
    UNION SELECT 'attachments/maintenance/' || filename FROM maintenance_attachments_local
    UNION SELECT 'attachments/maintenance/' || filename FROM expense_attachments_local
  `);
  return rows.map((r) => r.path);
}

const fileAt = (path: string) => new File(Paths.document, ...path.split('/'));

// Size + modified time: a replaced bike photo (same file name) re-uploads.
function signatureOf(file: File): string | null {
  const info = file.info();
  return info.exists ? `${info.size}:${info.modificationTime}` : null;
}

/** Uploads new and changed photos, and removes deleted ones from the backup. */
export async function pushMedia(request: AuthedRequest): Promise<MediaResult> {
  const db = await getDb();
  await ensureMediaTable(db);
  const state = new Map(
    (await db.getAllAsync<{ path: string; signature: string }>('SELECT * FROM media_state')).map((r) => [r.path, r.signature])
  );
  const paths = await referencedPaths(db);

  try {
    for (const path of paths) {
      const file = fileAt(path);
      const signature = signatureOf(file);
      if (!signature || state.get(path) === signature) continue;

      const { url, headers } = await request<{ url: string; headers: Record<string, string> }>('/media/upload-url', {
        method: 'POST',
        body: { path, size: file.size },
      });
      // The server has now listed this file for the account. Note it here
      // (empty signature = not confirmed, so it's uploaded again next time)
      // before uploading, so if the upload's reply is lost and the photo is
      // then deleted, the delete still reaches the backup.
      await db.runAsync("INSERT OR IGNORE INTO media_state (path, signature) VALUES (?, '')", [path]);
      const result = await file.upload(url, { httpMethod: 'PUT', headers, uploadType: UploadType.BINARY_CONTENT });
      if (result.status < 200 || result.status >= 300) throw new Error(`Photo upload failed (${result.status})`);
      await db.runAsync('INSERT OR REPLACE INTO media_state (path, signature) VALUES (?, ?)', [path, signature]);
    }

    const current = new Set(paths);
    const removed = [...state.keys()].filter((path) => !current.has(path));
    for (let i = 0; i < removed.length; i += 200) {
      const batch = removed.slice(i, i + 200);
      await request('/media/delete', { method: 'POST', body: { paths: batch } });
      for (const path of batch) await db.runAsync('DELETE FROM media_state WHERE path = ?', [path]);
    }
    return 'done';
  } catch (error) {
    if (error instanceof ApiError && error.status === 413) return 'full';
    if (error instanceof ApiError && error.status === 503) return 'unavailable';
    throw error;
  }
}

/** Downloads any backed-up photo that isn't on this phone (a few at a time). */
export async function restoreMedia(request: AuthedRequest): Promise<number> {
  const db = await getDb();
  await ensureMediaTable(db);
  let files: { path: string; url: string }[];
  try {
    ({ files } = await request<{ files: { path: string; url: string }[] }>('/media/files'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return 0;
    throw error;
  }

  const missing = files.filter((f) => !fileAt(f.path).exists);
  let restored = 0;
  const worker = async () => {
    for (let next = missing.shift(); next; next = missing.shift()) {
      try {
        const parts = next.path.split('/');
        const dir = new Directory(Paths.document, ...parts.slice(0, -1));
        if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
        const saved = await File.downloadFileAsync(next.url, fileAt(next.path), { idempotent: true });
        const signature = signatureOf(saved);
        if (signature) {
          await db.runAsync('INSERT OR REPLACE INTO media_state (path, signature) VALUES (?, ?)', [next.path, signature]);
        }
        restored += 1;
      } catch (e) {
        console.warn('[mediaSync] couldn’t restore', next.path, e);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return restored;
}
