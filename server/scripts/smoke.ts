// End-to-end check of the account API against a throwaway in-memory SQLite
// database — nothing to install, nothing touched on disk.  Run: npm run smoke
import assert from 'node:assert/strict';

import { buildApp } from '../src/app.js';
import { migrate, openDatabase } from '../src/db.js';

const db = openDatabase(':memory:');
migrate(db, () => {});
const app = await buildApp({ db, sessionDays: 60, logger: false });

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// Each scenario gets its own client address, so the per-IP rate limits (which
// are tested separately) don't bleed between scenarios.
let nextOctet = 1;
function client() {
  const remoteAddress = `203.0.113.${nextOctet++}`;
  return async (method: 'GET' | 'POST' | 'DELETE', url: string, options: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) => {
    const res = await app.inject({
      method,
      url,
      remoteAddress,
      headers: { ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...options.headers },
      ...(options.body !== undefined ? { payload: options.body as object } : {}),
    });
    const text = res.body;
    return { status: res.statusCode, json: text ? (JSON.parse(text) as Record<string, any>) : null, headers: res.headers };
  };
}

const rider = {
  username: 'Rider_One',
  email: 'Rider.One@Example.com',
  phone: '(501) 234-5678',
  password: 'correct-horse-9',
};

console.log('Health and basics');
{
  const api = client();
  const health = await api('GET', '/health');
  assert.equal(health.status, 200);
  ok('health check reaches the database');

  const missing = await api('GET', '/nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.json?.error.code, 'not_found');
  ok('unknown routes return the standard error shape');
}

console.log('Sign-up validation');
{
  const cases: [string, Record<string, string>, string, string][] = [
    ['username too short', { ...rider, username: 'ab' }, 'invalid_username', 'username'],
    ['username starting with a digit', { ...rider, username: '1rider' }, 'invalid_username', 'username'],
    ['username with a space', { ...rider, username: 'two words' }, 'invalid_username', 'username'],
    ['reserved username', { ...rider, username: 'Admin' }, 'reserved_username', 'username'],
    ['bad email', { ...rider, email: 'not-an-email' }, 'invalid_email', 'email'],
    ['bad phone', { ...rider, phone: '123' }, 'invalid_phone', 'phone'],
    ['short password', { ...rider, password: 'short' }, 'weak_password', 'password'],
    ['common password', { ...rider, password: 'password123' }, 'weak_password', 'password'],
    ['password equal to username', { ...rider, password: 'rider_one' }, 'weak_password', 'password'],
  ];
  for (const [name, body, code, field] of cases) {
    // A fresh address per case: sign-up is limited to 6 per 10 minutes each.
    const res = await client()('POST', '/auth/signup', { body });
    assert.equal(res.status, 400, name);
    assert.equal(res.json?.error.code, code, name);
    assert.equal(res.json?.error.field, field, name);
    ok(name);
  }
}

console.log('Sign-up, uniqueness, and live username check');
let token: string;
{
  const api = client();
  const before = await api('GET', '/auth/username-available?username=Rider_One');
  assert.deepEqual(before.json, { available: true });
  ok('a free username reports available');

  const bad = await api('GET', '/auth/username-available?username=ab');
  assert.equal(bad.json?.available, false);
  assert.equal(bad.json?.reason, 'invalid_username');
  ok('an invalid username reports why');

  const created = await api('POST', '/auth/signup', { body: rider });
  assert.equal(created.status, 201);
  assert.equal(created.json?.user.username, 'Rider_One', 'keeps the capitalisation the person chose');
  assert.equal(created.json?.user.email, 'rider.one@example.com', 'email stored lowercase');
  assert.equal(created.json?.user.phone, '+15012345678', 'phone stored in international format');
  assert.ok(typeof created.json?.token === 'string' && created.json.token.length >= 40);
  assert.equal(created.json?.user.password_hash, undefined, 'never returns the password hash');
  token = created.json!.token;
  ok('valid sign-up creates the account and a session');

  const taken = await api('GET', '/auth/username-available?username=RIDER_ONE');
  assert.deepEqual(taken.json, { available: false, reason: 'taken', message: 'That username is taken.' });
  ok('username check is case-insensitive');

  const dupName = await api('POST', '/auth/signup', {
    body: { ...rider, username: 'rider_one', email: 'other@example.com', phone: '+1 479 555 0188' },
  });
  assert.equal(dupName.status, 409);
  assert.equal(dupName.json?.error.code, 'username_taken');
  ok('same username, different capitalisation -> "taken"');

  const dupEmail = await api('POST', '/auth/signup', {
    body: { ...rider, username: 'Other_Rider', email: 'RIDER.ONE@example.com', phone: '+1 479 555 0188' },
  });
  assert.equal(dupEmail.status, 409);
  assert.equal(dupEmail.json?.error.code, 'email_taken');
  ok('same email, different capitalisation -> "taken"');

  const dupPhone = await api('POST', '/auth/signup', {
    body: { ...rider, username: 'Other_Rider', email: 'other@example.com', phone: '+1 501-234-5678' },
  });
  assert.equal(dupPhone.status, 409);
  assert.equal(dupPhone.json?.error.code, 'phone_taken');
  ok('same phone number typed differently -> "taken"');
}

console.log('Two people racing for the same username');
{
  const raceBody = (n: number) => ({
    username: 'Race_Winner',
    email: `racer${n}@example.com`,
    phone: n === 1 ? '+1 501 234 1001' : '+1 501 234 1002',
    password: 'race-password-7',
  });
  const [a, b] = await Promise.all([
    client()('POST', '/auth/signup', { body: raceBody(1) }),
    client()('POST', '/auth/signup', { body: raceBody(2) }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const loser = a.status === 409 ? a : b;
  assert.equal(loser.json?.error.code, 'username_taken');
  ok('exactly one wins; the other is told the name is taken');
}

console.log('Signing in');
{
  const api = client();
  for (const [label, identifier] of [
    ['username', 'rider_one'],
    ['email', 'RIDER.one@example.com'],
    ['phone', '501-234-5678'],
  ] as const) {
    const res = await api('POST', '/auth/signin', { body: { identifier, password: rider.password } });
    assert.equal(res.status, 200, label);
    assert.equal(res.json?.user.username, 'Rider_One', label);
    ok(`signs in with ${label}`);
  }

  const wrongPassword = await api('POST', '/auth/signin', { body: { identifier: 'rider_one', password: 'wrong-password-1' } });
  const unknownUser = await api('POST', '/auth/signin', { body: { identifier: 'nobody_here', password: 'wrong-password-1' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.deepEqual(wrongPassword.json, unknownUser.json);
  ok('wrong password and unknown account give the identical response');
}

console.log('Lockout after repeated wrong passwords');
{
  const api = client();
  // One wrong attempt was already recorded above, so the lock lands on or
  // before the 10th wrong guess in this loop.
  let wrongGuesses = 0;
  let status = 0;
  while (wrongGuesses < 12) {
    const res = await api('POST', '/auth/signin', { body: { identifier: 'Rider_One', password: `wrong-guess-${wrongGuesses}x` } });
    status = res.status;
    if (status === 429) break;
    assert.equal(status, 401);
    wrongGuesses += 1;
  }
  assert.equal(status, 429, 'repeated wrong passwords must eventually lock the account');
  assert.ok(wrongGuesses <= 10, `locked only after ${wrongGuesses} wrong guesses`);
  ok(`locked out after ${wrongGuesses + 1} wrong guesses in total`);

  const locked = await api('POST', '/auth/signin', { body: { identifier: 'rider_one', password: rider.password } });
  assert.equal(locked.status, 429);
  assert.equal(locked.json?.error.code, 'too_many_attempts');
  ok('even the correct password is refused while locked');

  const otherAccount = await client()('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'race-password-7' } });
  assert.equal(otherAccount.status, 200);
  ok('other accounts are unaffected');
}

console.log('Sessions');
{
  const api = client();
  const me = await api('GET', '/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.json?.user.username, 'Rider_One');
  ok('a valid token returns the account');

  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: 'garbage-token' })).status, 401);
  ok('missing or invalid tokens are rejected');
}

console.log('Changing password');
let secondToken: string;
{
  const api = client();
  // Use the race winner so the locked-out Rider_One account isn't involved.
  const login = await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'race-password-7' } });
  const first = login.json!.token as string;
  secondToken = (await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'race-password-7' } })).json!.token;

  const wrong = await api('POST', '/auth/change-password', { token: first, body: { currentPassword: 'nope-nope-1', newPassword: 'brand-new-pass-1' } });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.json?.error.field, 'currentPassword');
  ok('wrong current password is refused');

  const weak = await api('POST', '/auth/change-password', { token: first, body: { currentPassword: 'race-password-7', newPassword: 'short' } });
  assert.equal(weak.status, 400);
  ok('weak new password is refused');

  const same = await api('POST', '/auth/change-password', { token: first, body: { currentPassword: 'race-password-7', newPassword: 'race-password-7' } });
  assert.equal(same.status, 400);
  assert.equal(same.json?.error.code, 'same_password');
  ok('reusing the same password is refused');

  const changed = await api('POST', '/auth/change-password', { token: first, body: { currentPassword: 'race-password-7', newPassword: 'brand-new-pass-1' } });
  assert.equal(changed.status, 204);
  ok('password changes');

  assert.equal((await api('GET', '/auth/me', { token: first })).status, 200);
  ok('the device that changed it stays signed in');
  assert.equal((await api('GET', '/auth/me', { token: secondToken })).status, 401);
  ok('every other device is signed out');

  const oldPw = await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'race-password-7' } });
  assert.equal(oldPw.status, 401);
  const newPw = await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'brand-new-pass-1' } });
  assert.equal(newPw.status, 200);
  ok('old password stops working, new one works');
}

console.log('Signing out and deleting the account');
{
  const api = client();
  const signedIn = await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'brand-new-pass-1' } });
  const t = signedIn.json!.token as string;

  assert.equal((await api('POST', '/auth/signout', { token: t })).status, 204);
  assert.equal((await api('GET', '/auth/me', { token: t })).status, 401);
  ok('sign-out ends the session');

  const t2 = (await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'brand-new-pass-1' } })).json!.token as string;
  const wrong = await api('DELETE', '/auth/account', { token: t2, body: { password: 'not-my-password' } });
  assert.equal(wrong.status, 403);
  assert.equal((await api('GET', '/auth/me', { token: t2 })).status, 200);
  ok('deleting with the wrong password is refused and changes nothing');

  const deleted = await api('DELETE', '/auth/account', { token: t2, body: { password: 'brand-new-pass-1' } });
  assert.equal(deleted.status, 204);
  assert.equal((await api('GET', '/auth/me', { token: t2 })).status, 401);
  assert.equal((await api('POST', '/auth/signin', { body: { identifier: 'Race_Winner', password: 'brand-new-pass-1' } })).status, 401);
  assert.deepEqual((await api('GET', '/auth/username-available?username=Race_Winner')).json, { available: true });
  const leftovers = db
    .prepare(
      `SELECT (SELECT count(*) FROM users WHERE lower(username)='race_winner') AS users,
        (SELECT count(*) FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL) AS orphans`
    )
    .get() as { users: number; orphans: number };
  assert.equal(Number(leftovers.users), 0);
  assert.equal(Number(leftovers.orphans), 0);
  ok('account, sessions and the username are all gone after deletion');
}

console.log('Rate limiting and forged addresses');
{
  const spoofer = async (i: number) =>
    app.inject({
      method: 'GET',
      url: '/auth/username-available?username=someone',
      remoteAddress: '198.51.100.77', // a public address: no trust in its headers
      headers: { 'x-forwarded-for': `10.0.0.${i}, 192.0.2.${i}` },
    });
  let limited = 0;
  for (let i = 1; i <= 45; i++) {
    if ((await spoofer(i)).statusCode === 429) limited += 1;
  }
  assert.ok(limited >= 4, `expected the limit to hold despite forged headers, got ${limited} blocked`);
  ok('forged X-Forwarded-For from a public address does not dodge the limit');

  const proxied = async (i: number) =>
    app.inject({
      method: 'GET',
      url: '/auth/username-available?username=someone',
      remoteAddress: '100.64.0.9', // like Railway's private-network proxy
      headers: { 'x-forwarded-for': `198.51.100.${i}` },
    });
  let blocked = 0;
  for (let i = 1; i <= 45; i++) {
    if ((await proxied(i)).statusCode === 429) blocked += 1;
  }
  assert.equal(blocked, 0, 'different real visitors behind the proxy must not share one limit');
  ok('visitors behind a private-network proxy are told apart by their real address');
}

console.log('Malformed requests');
{
  const badJson = await app.inject({
    method: 'POST',
    url: '/auth/signin',
    remoteAddress: '203.0.113.250',
    headers: { 'content-type': 'application/json' },
    payload: '{ not json',
  });
  assert.equal(badJson.statusCode, 400);
  assert.equal(JSON.parse(badJson.body).error.code, 'invalid_request');
  ok('malformed JSON gets a clean 400');

  const huge = await app.inject({
    method: 'POST',
    url: '/auth/signin',
    remoteAddress: '203.0.113.251',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ identifier: 'a', password: 'x'.repeat(40_000) }),
  });
  assert.ok(huge.statusCode === 413 || huge.statusCode === 400);
  ok('oversized bodies are rejected');
}

await app.close();
db.close();
console.log(`\nAll ${passed} checks passed.`);
