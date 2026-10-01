import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import net from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Db } from './db.js';
import { sendError } from './errors.js';
import { authRoutes } from './routes/auth.js';

export type AppOptions = {
  db: Db;
  sessionDays: number;
  logger: boolean;
};

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

  app.get('/health', async (_request, reply) => {
    try {
      options.db.prepare('SELECT 1').get();
      return { ok: true };
    } catch {
      return sendError(reply, 503, 'database_unavailable', 'Database unavailable.');
    }
  });

  await app.register(authRoutes, { prefix: '/auth', db: options.db, sessionDays: options.sessionDays });

  return app;
}
