import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import type { Db } from '../db.js';
import { sendError } from '../errors.js';
import { DailyAllowance } from '../limits.js';

type Options = {
  db: Db;
  sessionDays: number;
  /** Backup space per account, and for the whole database (which has to fit on the server's disk). */
  userQuotaBytes: number;
  totalQuotaBytes: number;
  /** Backup downloads per day, per account and for everyone together. */
  dailyDownloadUserBytes: number;
  dailyDownloadTotalBytes: number;
};

/** What the phone may back up. Anything else is rejected. */
export const SYNC_KINDS = [
  'bikes',
  'rides',
  'ride_points',
  'maintenance_records',
  'maintenance_attachments',
  'expenses',
  'expense_attachments',
  'fuel_logs',
  'settings',
] as const;

const recordRef = z.object({ kind: z.enum(SYNC_KINDS), id: z.string().min(1).max(100) });
const pushBody = z.object({
  upserts: z.array(recordRef.extend({ data: z.record(z.string(), z.unknown()) })).max(500),
  deletes: z.array(recordRef).max(2000),
});

// A long ride's GPS points are one record and can be a few MB of JSON.
const PUSH_BODY_LIMIT = 10 * 1024 * 1024;
// Pages for download are cut by size so one response stays a sensible size.
const PAGE_BYTE_BUDGET = 4 * 1024 * 1024;

export const syncRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { db, userQuotaBytes, totalQuotaBytes } = options;
  const guard = requireAuth(db, options.sessionDays);
  const downloads = new DailyAllowance(options.dailyDownloadUserBytes, options.dailyDownloadTotalBytes);

  const upsert = db.prepare(
    `INSERT INTO user_records (user_id, kind, record_id, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, kind, record_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  );
  const remove = db.prepare('DELETE FROM user_records WHERE user_id = ? AND kind = ? AND record_id = ?');
  const page = db.prepare(
    `SELECT kind, record_id, data FROM user_records
      WHERE user_id = ? AND (kind > ? OR (kind = ? AND record_id > ?))
      ORDER BY kind, record_id LIMIT 500`
  );
  const summary = db.prepare(
    `SELECT kind, count(*) AS count, max(updated_at) AS last FROM user_records WHERE user_id = ? GROUP BY kind`
  );
  // octet_length reads only each row's stored size, not the data itself.
  const sizeOf = db.prepare('SELECT octet_length(data) AS bytes FROM user_records WHERE user_id = ? AND kind = ? AND record_id = ?');
  const usedByUser = db.prepare('SELECT coalesce(sum(octet_length(data)), 0) AS used FROM user_records WHERE user_id = ?');
  const databaseBytes = db.prepare(
    'SELECT (page_count - freelist_count) * page_size AS bytes FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size()'
  );
  const bytesOf = (userId: string, r: { kind: string; id: string }) =>
    Number((sizeOf.get(userId, r.kind, r.id) as { bytes: number } | undefined)?.bytes ?? 0);

  // Save a batch of changed and deleted records, all-or-nothing.
  app.post(
    '/push',
    { preHandler: guard, bodyLimit: PUSH_BODY_LIMIT, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = pushBody.safeParse(request.body);
      if (!body.success) return sendError(reply, 400, 'invalid_request', 'That backup batch wasn’t valid.');
      const { userId } = request.auth!;
      const now = Date.now();
      const upserts = body.data.upserts.map((r) => ({ ...r, json: JSON.stringify(r.data) }));

      // How much this batch grows the account's backup. Only growth is
      // checked against the caps, so a full account can still edit and delete.
      let growth = 0;
      for (const r of upserts) growth += Buffer.byteLength(r.json) - bytesOf(userId, r);
      for (const r of body.data.deletes) growth -= bytesOf(userId, r);
      if (growth > 0) {
        if (Number((usedByUser.get(userId) as { used: number }).used) + growth > userQuotaBytes) {
          return sendError(reply, 413, 'quota_exceeded', 'Your cloud backup is full.');
        }
        if (Number((databaseBytes.get() as { bytes: number }).bytes) + growth > totalQuotaBytes) {
          return sendError(reply, 413, 'storage_full', 'Cloud backup is full for now.');
        }
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        for (const r of upserts) upsert.run(userId, r.kind, r.id, r.json, now);
        for (const r of body.data.deletes) remove.run(userId, r.kind, r.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { upserted: body.data.upserts.length, deleted: body.data.deletes.length };
    }
  );

  // Download everything, a page at a time (cursor = last kind + id seen).
  app.get('/records', { preHandler: guard }, async (request, reply) => {
    const query = z
      .object({ afterKind: z.string().max(40).default(''), afterId: z.string().max(100).default('') })
      .safeParse(request.query);
    if (!query.success) return sendError(reply, 400, 'invalid_request', 'That request wasn’t valid.');
    const { afterKind, afterId } = query.data;

    const rows = page.all(request.auth!.userId, afterKind, afterKind, afterId) as {
      kind: string;
      record_id: string;
      data: string;
    }[];
    const records: { kind: string; id: string; data: unknown }[] = [];
    let bytes = 0;
    for (const row of rows) {
      if (records.length > 0 && bytes + row.data.length > PAGE_BYTE_BUDGET) break;
      bytes += row.data.length;
      records.push({ kind: row.kind, id: row.record_id, data: JSON.parse(row.data) });
    }
    // A restore downloads everything once; this stops anyone pulling the
    // same backup over and over, which the server pays for in traffic.
    if (!downloads.take(request.auth!.userId, bytes)) {
      return sendError(reply, 429, 'download_limit', 'That’s a lot of downloading for one day. Try again tomorrow.');
    }
    const last = records.at(-1);
    const more = records.length < rows.length || rows.length === 500;
    return { records, next: more && last ? { afterKind: last.kind, afterId: last.id } : null };
  });

  // What's backed up, for Settings ("25 rides backed up") and the restore offer.
  app.get('/summary', { preHandler: guard }, async (request) => {
    const rows = summary.all(request.auth!.userId) as { kind: string; count: number; last: number }[];
    const counts = Object.fromEntries(rows.map((r) => [r.kind, Number(r.count)]));
    const lastBackupAt = rows.length ? new Date(Math.max(...rows.map((r) => Number(r.last)))).toISOString() : null;
    return { counts, lastBackupAt };
  });
};
