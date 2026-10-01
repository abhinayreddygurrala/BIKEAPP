import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createSession, FailureTracker, requireAuth, toAccountUser, type UserRow } from '../auth.js';
import type { Db } from '../db.js';
import { sendError, uniqueViolation } from '../errors.js';
import { hashPassword, verifyPassword } from '../security.js';
import {
  changePasswordBody,
  checkPassword,
  checkUsername,
  classifyIdentifier,
  deleteAccountBody,
  normalizeEmail,
  normalizePhone,
  signInBody,
  signUpBody,
} from '../validation.js';

type Options = { db: Db; sessionDays: number };

const INVALID_REQUEST = 'That request wasn’t valid.';

export const authRoutes: FastifyPluginAsync<Options> = async (app, { db, sessionDays }) => {
  const guard = requireAuth(db, sessionDays);
  const failures = new FailureTracker();
  // Signing in with an unknown account still burns a real password hash, so
  // a wrong username and a wrong password take the same time to reject.
  // Started here but deliberately not awaited: Fastify gives plugins 10s to
  // start, and on a busy machine this memory-hard hash alone has blown that
  // budget and crash-looped the server. It's long finished by the time
  // anyone signs in.
  const decoyHash = hashPassword(randomBytes(16).toString('hex'));
  decoyHash.catch((error) => app.log.error(error));

  const usernameTaken = db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)');
  const insertUser = db.prepare(
    'INSERT INTO users (id, username, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const userBy = {
    email: db.prepare('SELECT id, username, email, phone, password_hash, created_at FROM users WHERE email = ?'),
    phone: db.prepare('SELECT id, username, email, phone, password_hash, created_at FROM users WHERE phone = ?'),
    username: db.prepare(
      'SELECT id, username, email, phone, password_hash, created_at FROM users WHERE lower(username) = ?'
    ),
  };
  const passwordHashOf = db.prepare('SELECT password_hash FROM users WHERE id = ?');

  // Live "is this username free?" check while someone is typing it.
  app.get('/username-available', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (request, reply) => {
    const query = z.object({ username: z.string().max(64) }).safeParse(request.query);
    if (!query.success) return sendError(reply, 400, 'invalid_request', INVALID_REQUEST);

    const checked = checkUsername(query.data.username);
    if (!checked.ok) {
      return { available: false, reason: checked.error.code, message: checked.error.message };
    }
    if (usernameTaken.get(checked.username)) {
      return { available: false, reason: 'taken', message: 'That username is taken.' };
    }
    return { available: true };
  });

  app.post('/signup', { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const body = signUpBody.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', INVALID_REQUEST);

    const username = checkUsername(body.data.username);
    if (!username.ok) return sendError(reply, 400, username.error.code, username.error.message, username.error.field);
    const email = normalizeEmail(body.data.email);
    if (!email.ok) return sendError(reply, 400, email.error.code, email.error.message, email.error.field);
    const phone = normalizePhone(body.data.phone);
    if (!phone.ok) return sendError(reply, 400, phone.error.code, phone.error.message, phone.error.field);
    const passwordProblem = checkPassword(body.data.password, { username: username.username, email: email.email });
    if (passwordProblem) return sendError(reply, 400, passwordProblem.code, passwordProblem.message, passwordProblem.field);

    const passwordHash = await hashPassword(body.data.password);
    const row: UserRow = {
      id: randomUUID(),
      username: username.username,
      email: email.email,
      phone: phone.phone,
      created_at: new Date().toISOString(),
    };

    try {
      // No "check first, then insert": the unique indexes decide, so two
      // people signing up at the same instant can't both get the same name.
      insertUser.run(row.id, row.username, row.email, row.phone, passwordHash, row.created_at);
    } catch (error) {
      const violation = uniqueViolation(error);
      if (violation === null) throw error;
      if (violation.includes('username')) {
        return sendError(reply, 409, 'username_taken', 'That username is taken.', 'username');
      }
      if (violation.includes('email')) {
        return sendError(reply, 409, 'email_taken', 'An account with that email already exists.', 'email');
      }
      if (violation.includes('phone')) {
        return sendError(reply, 409, 'phone_taken', 'An account with that phone number already exists.', 'phone');
      }
      throw error;
    }

    const token = createSession(db, row.id, sessionDays);
    return reply.status(201).send({ token, user: toAccountUser(row) });
  });

  app.post('/signin', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = signInBody.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'invalid_request', INVALID_REQUEST);

    const identifier = classifyIdentifier(body.data.identifier);
    const failureKey = `${identifier.kind}:${identifier.value}`;
    if (failures.isLocked(failureKey)) {
      return sendError(reply, 429, 'too_many_attempts', 'Too many wrong attempts. Wait 15 minutes and try again.');
    }

    const user = userBy[identifier.kind].get(identifier.value) as (UserRow & { password_hash: string }) | undefined;

    const passwordOk = await verifyPassword(body.data.password, user?.password_hash ?? (await decoyHash));
    if (!user || !passwordOk) {
      failures.recordFailure(failureKey);
      return sendError(reply, 401, 'invalid_credentials', 'Incorrect username, email, phone, or password.');
    }

    failures.clear(failureKey);
    const token = createSession(db, user.id, sessionDays);
    return { token, user: toAccountUser(user) };
  });

  app.get('/me', { preHandler: guard }, async (request) => {
    return { user: request.auth!.user };
  });

  app.post('/signout', { preHandler: guard }, async (request, reply) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(request.auth!.sessionId);
    return reply.status(204).send();
  });

  app.post(
    '/change-password',
    { preHandler: guard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = changePasswordBody.safeParse(request.body);
      if (!body.success) return sendError(reply, 400, 'invalid_request', INVALID_REQUEST);
      const { userId, sessionId, user } = request.auth!;

      const current = passwordHashOf.get(userId) as { password_hash: string } | undefined;
      if (!current || !(await verifyPassword(body.data.currentPassword, current.password_hash))) {
        return sendError(reply, 403, 'wrong_password', 'Your current password is incorrect.', 'currentPassword');
      }

      const problem = checkPassword(body.data.newPassword, { username: user.username, email: user.email });
      if (problem) return sendError(reply, 400, problem.code, problem.message, 'newPassword');
      if (body.data.newPassword === body.data.currentPassword) {
        return sendError(reply, 400, 'same_password', 'Your new password must be different from the current one.', 'newPassword');
      }

      const newHash = await hashPassword(body.data.newPassword);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
      // Changing a password signs out every other device that had the old one.
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, sessionId);
      return reply.status(204).send();
    }
  );

  // Deleting an account is permanent and required by the App Store for any
  // app that lets people create one. The password is re-checked so a stolen
  // unlocked phone can't wipe someone's account with a single tap.
  app.delete(
    '/account',
    { preHandler: guard, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const body = deleteAccountBody.safeParse(request.body);
      if (!body.success) return sendError(reply, 400, 'invalid_request', INVALID_REQUEST);
      const { userId } = request.auth!;

      const current = passwordHashOf.get(userId) as { password_hash: string } | undefined;
      if (!current || !(await verifyPassword(body.data.password, current.password_hash))) {
        return sendError(reply, 403, 'wrong_password', 'That password is incorrect.', 'password');
      }

      // Sessions (and, later, anything else tied to this user) go with it via ON DELETE CASCADE.
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      return reply.status(204).send();
    }
  );
};
