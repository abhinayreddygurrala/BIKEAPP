import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import net from 'node:net';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Db } from './db.js';
import { sendError } from './errors.js';
import type { GoogleMaps } from './maps.js';
import { authRoutes } from './routes/auth.js';
import { mapsRoutes, type MapsCaps } from './routes/maps.js';
import { mediaRoutes } from './routes/media.js';
import { syncRoutes } from './routes/sync.js';
import type { MediaStore } from './storage.js';

export type AppOptions = {
  db: Db;
  sessionDays: number;
  logger: boolean;
  /** Photo backup; null turns it off (the phone keeps photos local). */
  media?: MediaStore | null;
  mediaUserQuotaBytes?: number;
  mediaTotalQuotaBytes?: number;
  /** Photo download links handed out per day (each counted at its file's size). */
  mediaDailyLinkUserBytes?: number;
  mediaDailyLinkTotalBytes?: number;
  /** Cloud backup of records: space, and downloads per day. */
  recordsUserQuotaBytes?: number;
  recordsTotalQuotaBytes?: number;
  recordsDailyDownloadUserBytes?: number;
  recordsDailyDownloadTotalBytes?: number;
  /** Google place search and routing; null makes the app use Apple's maps. */
  google?: GoogleMaps | null;
  mapsCaps?: MapsCaps;
};

const MB = 1024 * 1024;
const gzipAsync = promisify(gzip);

/**
 * Fastify refuses "trust N proxy hops" because a direct client could forge
 * the forwarding header. Instead, trust a forwarding header only when it was
 * handed to us by a machine on a private network. On Railway the container
 * is reachable only through Railway's own proxy, which sits on a private
 * (100.64.0.0/10) address, so the real visitor's IP is recovered correctly
 * and forged headers from the public internet are ignored.
 */
export function isPrivateAddress(address: string): boolean {
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (net.isIPv4(ip)) {
    const [a = -1, b = -1] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  return false;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger
      ? {
          level: 'info',
          // Never write credentials into logs, even by accident.
          redact: ['req.headers.authorization'],
        }
      : false,
    trustProxy: isPrivateAddress,
    bodyLimit: 16 * 1024,
  });

  await app.register(helmet);
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      return sendError(reply, 500, 'server_error', 'Something went wrong on our end. Try again in a moment.');
    }
    if (status === 429) {
      return sendError(reply, 429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
    }
    return sendError(reply, status, 'invalid_request', 'That request wasn’t valid.');
  });

  app.setNotFoundHandler((_request, reply) => sendError(reply, 404, 'not_found', 'Not found.'));

  // Backup downloads are big JSON that gzip shrinks several times over, and
  // this server's outbound traffic is billed past Google's free 1 GB a month.
  // Phones ask for gzip on their own and unpack it without any app code.
  app.addHook('onSend', async (request, reply, payload) => {
    if (typeof payload !== 'string' || payload.length < 1024) return payload;
    if (!/\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''))) return payload;
    reply.header('Content-Encoding', 'gzip').header('Vary', 'Accept-Encoding');
    return gzipAsync(payload);
  });

  app.get('/health', async (_request, reply) => {
    try {
      options.db.prepare('SELECT 1').get();
      return { ok: true };
    } catch {
      return sendError(reply, 503, 'database_unavailable', 'Database unavailable.');
    }
  });

  const media = options.media ?? null;
  await app.register(authRoutes, { prefix: '/auth', db: options.db, sessionDays: options.sessionDays, media });
  await app.register(syncRoutes, {
    prefix: '/sync',
    db: options.db,
    sessionDays: options.sessionDays,
    userQuotaBytes: options.recordsUserQuotaBytes ?? 500 * MB,
    totalQuotaBytes: options.recordsTotalQuotaBytes ?? 10 * 1024 * MB,
    dailyDownloadUserBytes: options.recordsDailyDownloadUserBytes ?? 1536 * MB,
    dailyDownloadTotalBytes: options.recordsDailyDownloadTotalBytes ?? 3072 * MB,
  });
  await app.register(mediaRoutes, {
    prefix: '/media',
    db: options.db,
    sessionDays: options.sessionDays,
    media,
    userQuotaBytes: options.mediaUserQuotaBytes ?? 1024 * MB,
    totalQuotaBytes: options.mediaTotalQuotaBytes ?? 4 * 1024 * MB,
    dailyLinkUserBytes: options.mediaDailyLinkUserBytes ?? 2048 * MB,
    dailyLinkTotalBytes: options.mediaDailyLinkTotalBytes ?? 3072 * MB,
  });
  await app.register(mapsRoutes, {
    prefix: '/maps',
    db: options.db,
    google: options.google ?? null,
    caps: options.mapsCaps ?? { routes: 9000, autocomplete: 9000, placeDetails: 9000 },
  });

  return app;
}
