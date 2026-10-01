import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from './db.js';
import { sendError } from './errors.js';
import { generateSessionToken, hashSessionToken } from './security.js';

export type AccountUser = {
  id: string;
  username: string;
  email: string;
  phone: string;
  createdAt: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireAuth on guarded routes. */
    auth?: { userId: string; sessionId: string; user: AccountUser };
  }
}

export type UserRow = { id: string; username: string; email: string; phone: string; created_at: string };

export function toAccountUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createSession(db: Db, userId: string, sessionDays: number): string {
  const token = generateSessionToken();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), userId, hashSessionToken(token), now, now, now + sessionDays * DAY_MS);
  return token;
}

/**
 * Route guard: requires `Authorization: Bearer <token>` for a live session.
 * Sessions slide forward (at most once a day) so someone who rides every
 * week never gets logged out, but an abandoned install eventually expires.
 */
export function requireAuth(db: Db, sessionDays: number) {
  const findSession = db.prepare(
    `SELECT s.id AS session_id, s.last_used_at, u.id, u.username, u.email, u.phone, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  );
  const slideSession = db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?');

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return sendError(reply, 401, 'unauthorized', 'Sign in to continue.');
    }

    const now = Date.now();
    const row = findSession.get(hashSessionToken(token), now) as
      | ({ session_id: string; last_used_at: number } & UserRow)
      | undefined;
    if (!row) {
      return sendError(reply, 401, 'unauthorized', 'Your session has expired. Sign in again.');
    }

    if (now - row.last_used_at > DAY_MS) {
      slideSession.run(now, now + sessionDays * DAY_MS, row.session_id);
    }

    request.auth = { userId: row.id, sessionId: row.session_id, user: toAccountUser(row) };
  };
}

/**
 * Remembers recent wrong-password attempts per login identifier, so someone
 * can't grind through guesses on one account from many IP addresses. In
 * memory is fine for a single server instance; it resets on restart.
 */
export class FailureTracker {
  private readonly attempts = new Map<string, { count: number; firstAt: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000
  ) {}

  isLocked(key: string): boolean {
    const entry = this.attempts.get(key);
    if (!entry) return false;
    if (Date.now() - entry.firstAt > this.windowMs) {
      this.attempts.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAt: now });
    } else {
      entry.count += 1;
    }
    if (this.attempts.size > 10_000) this.prune(now);
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.attempts) {
      if (now - entry.firstAt > this.windowMs) this.attempts.delete(key);
    }
  }
}
