import type { FastifyReply } from 'fastify';

/** Every error the app can receive has this one shape, so the client has one thing to parse. */
export function sendError(reply: FastifyReply, status: number, code: string, message: string, field?: string) {
  return reply.status(status).send({ error: { code, message, ...(field ? { field } : {}) } });
}

const SQLITE_CONSTRAINT_UNIQUE = 2067;

/**
 * SQLite reports a unique-constraint violation as extended code 2067, naming
 * the index or column that was hit ("index 'users_username_lower_idx'",
 * "users.email"). Returns that message, or null for any other error.
 */
export function uniqueViolation(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && (error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_UNIQUE) {
    return (error as { message?: string }).message ?? '';
  }
  return null;
}
