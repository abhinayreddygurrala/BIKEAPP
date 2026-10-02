import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import type { MediaStore } from '../storage.js';

type Options = {
  db: Db;
  sessionDays: number;
  media: MediaStore | null;
  userQuotaBytes: number;
  totalQuotaBytes: number;
};

// The phone's own file layout (relative to its documents folder), so a
// restore puts each file back exactly where the app looks for it.
const MEDIA_PATH = /^(photos\/(bikes|avatar)|attachments\/maintenance)\/[A-Za-z0-9_-]{1,80}\.(jpg|pdf)$/;
const mediaPath = z.string().regex(MEDIA_PATH);
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const LINK_SECONDS = 15 * 60;

export const objectKeyFor = (userId: string, path: string) => `users/${userId}/${path}`;

export function contentTypeFor(path: string) {
  return path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
}

/** Removes every file an account has in the bucket (best effort; used on account deletion). */
export async function deleteAllMedia(db: Db, media: MediaStore | null, userId: string, log: (e: unknown) => void) {
  if (!media) return;
  const rows = db.prepare('SELECT path FROM user_media WHERE user_id = ?').all(userId) as { path: string }[];
  const results = await Promise.allSettled(rows.map((r) => media.deleteObject(objectKeyFor(userId, r.path))));
  for (const result of results) if (result.status === 'rejected') log(result.reason);
}

export const mediaRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, media, userQuotaBytes, totalQuotaBytes } = options;
  const guard = requireAuth(db, options.sessionDays);

  const usedByUser = db.prepare('SELECT coalesce(sum(size), 0) AS used FROM user_media WHERE user_id = ? AND path <> ?');
  const usedTotal = db.prepare('SELECT coalesce(sum(size), 0) AS used FROM user_media WHERE NOT (user_id = ? AND path = ?)');
  const record = db.prepare(
    `INSERT INTO user_media (user_id, path, size, content_type, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, path) DO UPDATE SET size = excluded.size, content_type = excluded.content_type,
       updated_at = excluded.updated_at`
  );
  const owned = db.prepare('SELECT path, size FROM user_media WHERE user_id = ? ORDER BY path');
  const forget = db.prepare('DELETE FROM user_media WHERE user_id = ? AND path = ?');

  // Every route needs the bucket; without it the phone just keeps files local.
  app.addHook('preHandler', async (_request, reply) => {
    if (!media) return sendError(reply, 503, 'media_unavailable', 'Photo backup isn’t available right now.');
  });

  // A one-time link to upload one file straight to Cloud Storage. The size
  // the phone declares is enforced by Google (x-goog-content-length-range),
  // and checked against the caps first.
  app.post('/upload-url', { preHandler: guard }, async (request, reply) => {
    const body = z.object({ path: mediaPath, size: z.number().int().positive().max(MAX_FILE_BYTES) }).safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', 'That file can’t be backed up.');
    const { userId } = request.auth!;
    const { path, size } = body.data;

    const userUsed = Number((usedByUser.get(userId, path) as { used: number }).used);
    if (userUsed + size > userQuotaBytes) {
      return sendError(reply, 413, 'quota_exceeded', 'Your photo backup is full.');
    }
    const totalUsed = Number((usedTotal.get(userId, path) as { used: number }).used);
    if (totalUsed + size > totalQuotaBytes) {
      return sendError(reply, 413, 'storage_full', 'Photo backup is full for now.');
    }

    const contentType = contentTypeFor(path);
    const headers = { 'Content-Type': contentType, 'x-goog-content-length-range': `0,${size}` };
    record.run(userId, path, size, contentType, Date.now());
    return { url: media!.signedUrl('PUT', objectKeyFor(userId, path), { expiresSeconds: LINK_SECONDS, headers }), headers };
  });

  // Everything this account has backed up, with download links (for a restore).
  app.get('/files', { preHandler: guard }, async (request) => {
    const { userId } = request.auth!;
    const rows = owned.all(userId) as { path: string; size: number }[];
    const files = rows.map((r) => ({
      path: r.path,
      size: Number(r.size),
      url: media!.signedUrl('GET', objectKeyFor(userId, r.path), { expiresSeconds: 60 * 60 }),
    }));
    const usedBytes = files.reduce((sum, f) => sum + f.size, 0);
    return { files, usedBytes, quotaBytes: userQuotaBytes };
  });

  // Files deleted on the phone are deleted from the backup too.
  app.post('/delete', { preHandler: guard }, async (request, reply) => {
    const body = z.object({ paths: z.array(mediaPath).max(200) }).safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', 'That request wasn’t valid.');
    const { userId } = request.auth!;
    for (const path of body.data.paths) {
      await media!.deleteObject(objectKeyFor(userId, path));
      forget.run(userId, path);
    }
    return { deleted: body.data.paths.length };
  });
};
