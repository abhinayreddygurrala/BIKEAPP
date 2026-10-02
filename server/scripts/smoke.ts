// End-to-end check of the account API against a throwaway in-memory SQLite
// database — nothing to install, nothing touched on disk.  Run: npm run smoke
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import { buildApp } from '../src/app.js';
import { migrate, openDatabase } from '../src/db.js';
import { billingMonth, GoogleMapsError, type GoogleMaps } from '../src/maps.js';
import { createGcsStore, type MediaStore } from '../src/storage.js';

const db = openDatabase(':memory:');
migrate(db, () => {});

// Photo storage with a throwaway signing key; deletes are recorded instead of sent.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = createGcsStore('test-bucket', {
  client_email: 'signer@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
});
const deletedObjects: string[] = [];
const media: MediaStore = { signedUrl: signer.signedUrl, deleteObject: async (key) => void deletedObjects.push(key) };
const MB = 1024 * 1024;
const app = await buildApp({ db, sessionDays: 60, logger: false, media, mediaUserQuotaBytes: 20 * MB, mediaTotalQuotaBytes: 30 * MB });

/** Google's encoded polyline format (precision 5), for building fake routes. */
function polyline(points: [number, number][]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    encode(la - prevLat);
    encode(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

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

console.log('Cloud backup');
{
  const api = client();
  const mk = async (n: string, phone: string) =>
    (await api('POST', '/auth/signup', {
      body: { username: n, email: `${n.toLowerCase()}@example.com`, phone, password: 'backup-pass-123' },
    })).json!.token as string;
  const alice = await mk('Backup_Alice', '+1 501 234 3001');
  const bob = await client()('POST', '/auth/signup', {
    body: { username: 'Backup_Bob', email: 'backup_bob@example.com', phone: '+1 501 234 3002', password: 'backup-pass-123' },
  }).then((r) => r.json!.token as string);

  assert.equal((await api('POST', '/sync/push', { body: { upserts: [], deletes: [] } })).status, 401);
  ok('backup requires being signed in');

  const bigPoints = Array.from({ length: 25_000 }, (_, i) => ({ seq: i, lat: 36.1 + i / 1e5, lng: -94.1, recorded_at: '2026-10-16T10:00:00Z' }));
  const push = await api('POST', '/sync/push', {
    token: alice,
    body: {
      upserts: [
        { kind: 'bikes', id: 'bike-1', data: { id: 'bike-1', name: 'Triumph' } },
        { kind: 'rides', id: 'ride-1', data: { id: 'ride-1', bike_id: 'bike-1', distance_meters: 120000 } },
        { kind: 'ride_points', id: 'ride-1', data: { points: bigPoints } },
        { kind: 'settings', id: 'profile', data: { display_name: 'Alice', units: 'imperial' } },
      ],
      deletes: [],
    },
  });
  assert.equal(push.status, 200, JSON.stringify(push.json));
  ok(`saves records, including a ${(JSON.stringify(bigPoints).length / 1e6).toFixed(1)} MB ride of GPS points`);

  const summary = await api('GET', '/sync/summary', { token: alice });
  assert.deepEqual(summary.json?.counts, { bikes: 1, ride_points: 1, rides: 1, settings: 1 });
  assert.ok(summary.json?.lastBackupAt);
  ok('summary counts what is backed up');

  const edited = await api('POST', '/sync/push', {
    token: alice,
    body: { upserts: [{ kind: 'bikes', id: 'bike-1', data: { id: 'bike-1', name: 'Triumph Speed Twin' } }], deletes: [] },
  });
  assert.equal(edited.status, 200);
  const all: { kind: string; id: string; data: Record<string, unknown> }[] = [];
  let cursor: { afterKind: string; afterId: string } | null = { afterKind: '', afterId: '' };
  while (cursor) {
    const res = await api('GET', `/sync/records?afterKind=${cursor.afterKind}&afterId=${cursor.afterId}`, { token: alice });
    all.push(...res.json!.records);
    cursor = res.json!.next;
  }
  assert.equal(all.length, 4);
  assert.equal(all.find((r) => r.kind === 'bikes')?.data.name, 'Triumph Speed Twin');
  assert.equal((all.find((r) => r.kind === 'ride_points')?.data.points as unknown[]).length, 25_000);
  ok('downloads everything back, with edits applied and all GPS points intact');

  const bobsView = await api('GET', '/sync/records', { token: bob });
  assert.equal(bobsView.json?.records.length, 0);
  assert.deepEqual((await api('GET', '/sync/summary', { token: bob })).json?.counts, {});
  ok("one rider can never see another rider's data");

  const removed = await api('POST', '/sync/push', { token: alice, body: { upserts: [], deletes: [{ kind: 'bikes', id: 'bike-1' }] } });
  assert.equal(removed.json?.deleted, 1);
  assert.equal((await api('GET', '/sync/summary', { token: alice })).json?.counts.bikes, undefined);
  ok('deleting on the phone deletes from the backup');

  const junk = await api('POST', '/sync/push', {
    token: alice,
    body: { upserts: [{ kind: 'passwords', id: 'x', data: {} }], deletes: [] },
  });
  assert.equal(junk.status, 400);
  ok('unknown kinds of data are rejected');

  const many = Array.from({ length: 450 }, (_, i) => ({ kind: 'fuel_logs', id: `fuel-${String(i).padStart(4, '0')}`, data: { i } }));
  assert.equal((await api('POST', '/sync/push', { token: alice, body: { upserts: many, deletes: [] } })).status, 200);
  const more = Array.from({ length: 300 }, (_, i) => ({ kind: 'fuel_logs', id: `fuel-${String(450 + i).padStart(4, '0')}`, data: { i } }));
  assert.equal((await api('POST', '/sync/push', { token: alice, body: { upserts: more, deletes: [] } })).status, 200);
  let pages = 0;
  let count = 0;
  cursor = { afterKind: '', afterId: '' };
  while (cursor) {
    const res = await api('GET', `/sync/records?afterKind=${cursor.afterKind}&afterId=${cursor.afterId}`, { token: alice });
    pages += 1;
    count += res.json!.records.length;
    cursor = res.json!.next;
  }
  assert.equal(count, 753);
  assert.ok(pages >= 2);
  ok(`large backups download completely across ${pages} pages`);

  const del = await api('DELETE', '/auth/account', { token: alice, body: { password: 'backup-pass-123' } });
  assert.equal(del.status, 204);
  const leftover = db.prepare(`SELECT count(*) AS n FROM user_records WHERE user_id NOT IN (SELECT id FROM users)`).get() as { n: number };
  assert.equal(Number(leftover.n), 0);
  ok('deleting the account deletes its whole backup');
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

console.log('Photo backup');
{
  const api = client();
  const signup = (n: string, phone: string) =>
    client()('POST', '/auth/signup', {
      body: { username: n, email: `${n.toLowerCase()}@example.com`, phone, password: 'photo-pass-123' },
    }).then((r) => ({ token: r.json!.token as string, id: r.json!.user.id as string }));
  const carol = await signup('Photo_Carol', '+1 501 234 4001');
  const dave = await signup('Photo_Dave', '+1 501 234 4002');

  assert.equal((await api('POST', '/media/upload-url', { body: { path: 'photos/bikes/a.jpg', size: 10 } })).status, 401);
  ok('photo upload requires being signed in');

  const up = await api('POST', '/media/upload-url', { token: carol.token, body: { path: 'photos/bikes/bike-1.jpg', size: 400_000 } });
  assert.equal(up.status, 200, JSON.stringify(up.json));
  const url = new URL(up.json!.url);
  assert.equal(url.host, 'storage.googleapis.com');
  assert.equal(url.pathname, `/test-bucket/users/${carol.id}/photos/bikes/bike-1.jpg`);
  assert.equal(url.searchParams.get('X-Goog-SignedHeaders'), 'content-type;host;x-goog-content-length-range');
  assert.match(url.searchParams.get('X-Goog-Signature') ?? '', /^[0-9a-f]{512}$/);
  assert.deepEqual(up.json!.headers, { 'Content-Type': 'image/jpeg', 'x-goog-content-length-range': '0,400000' });
  ok('gives a signed, size-limited upload link inside the account’s own folder');

  for (const path of ['../users/x/a.jpg', 'photos/bikes/a.exe', 'secrets/a.jpg', 'photos/bikes/../../a.jpg']) {
    const bad = await api('POST', '/media/upload-url', { token: carol.token, body: { path, size: 10 } });
    assert.equal(bad.status, 400, path);
  }
  ok('refuses paths outside the photo folders');

  await api('POST', '/media/upload-url', { token: carol.token, body: { path: 'attachments/maintenance/r1.pdf', size: 15 * MB } });
  const over = await api('POST', '/media/upload-url', { token: carol.token, body: { path: 'attachments/maintenance/r2.jpg', size: 5 * MB } });
  assert.equal(over.status, 413);
  assert.equal(over.json?.error.code, 'quota_exceeded');
  const replace = await api('POST', '/media/upload-url', { token: carol.token, body: { path: 'photos/bikes/bike-1.jpg', size: 4 * MB } });
  assert.equal(replace.status, 200, 'replacing a file only counts its new size');
  ok('enforces the per-account cap (replacing a photo doesn’t double-count)');

  await api('POST', '/media/upload-url', { token: dave.token, body: { path: 'attachments/maintenance/d1.pdf', size: 10 * MB } });
  const full = await api('POST', '/media/upload-url', { token: dave.token, body: { path: 'attachments/maintenance/d2.pdf', size: 2 * MB } });
  assert.equal(full.status, 413);
  assert.equal(full.json?.error.code, 'storage_full');
  ok('enforces the whole-bucket cap that keeps storage in the free tier');

  const files = await api('GET', '/media/files', { token: carol.token });
  assert.deepEqual(files.json!.files.map((f: { path: string }) => f.path), ['attachments/maintenance/r1.pdf', 'photos/bikes/bike-1.jpg']);
  assert.equal(files.json!.usedBytes, 19 * MB);
  assert.equal(new URL(files.json!.files[0].url).searchParams.get('X-Goog-Expires'), '3600');
  const daveFiles = await api('GET', '/media/files', { token: dave.token });
  assert.equal(daveFiles.json!.files.length, 1);
  ok('lists only the account’s own files, with download links');

  const del = await api('POST', '/media/delete', { token: carol.token, body: { paths: ['attachments/maintenance/r1.pdf'] } });
  assert.equal(del.status, 200);
  assert.deepEqual(deletedObjects, [`users/${carol.id}/attachments/maintenance/r1.pdf`]);
  assert.equal((await api('GET', '/media/files', { token: carol.token })).json!.files.length, 1);
  ok('deleting on the phone deletes from storage');

  const gone = await api('DELETE', '/auth/account', { token: carol.token, body: { password: 'photo-pass-123' } });
  assert.equal(gone.status, 204);
  assert.ok(deletedObjects.includes(`users/${carol.id}/photos/bikes/bike-1.jpg`));
  assert.equal((db.prepare('SELECT count(*) AS n FROM user_media WHERE user_id = ?').get(carol.id) as { n: number }).n, 0);
  ok('deleting the account deletes all its photos');
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

console.log('Maps');
{
  const api = client();
  const status = await api('GET', '/maps/status');
  assert.equal(status.json?.google, false);
  const noKey = await api('POST', '/maps/routes', { body: { from: { latitude: 1, longitude: 1 }, to: { latitude: 2, longitude: 2 } } });
  assert.equal(noKey.status, 503);
  assert.equal(noKey.json?.error.code, 'maps_unavailable');
  ok('without a Google key the app is told to use Apple maps');

  // A straight highway and a zig-zag back road, as Google would encode them.
  const straight = polyline([[35.0, -94.0], [35.1, -94.0], [35.2, -94.0], [35.3, -94.0]]);
  const twisty = polyline([[35.0, -94.0], [35.05, -93.97], [35.1, -94.0], [35.15, -93.97], [35.2, -94.0], [35.3, -94.0]]);
  let failNext = false;
  const calls: string[] = [];
  const fake: GoogleMaps = {
    async autocomplete(input) {
      calls.push('autocomplete');
      return [{ placeId: 'ozark-ar', title: input, subtitle: 'Arkansas, USA' }];
    },
    async placeDetails(placeId) {
      calls.push('place');
      return placeId === 'missing' ? null : { latitude: 35.49, longitude: -93.83, address: 'Ozark, AR, USA' };
    },
    async computeRoutes(_from, _to, avoidHighways) {
      calls.push(avoidHighways ? 'routes-scenic' : 'routes');
      if (failNext) throw new GoogleMapsError('quota');
      return avoidHighways
        ? [{ polyline: twisty, distanceMeters: 40_000, durationSeconds: 3000 }]
        : [{ polyline: straight, distanceMeters: 33_000, durationSeconds: 1800 }];
    },
  };
  const mapsDb = openDatabase(':memory:');
  migrate(mapsDb, () => {});
  const mapsApp = await buildApp({
    db: mapsDb,
    sessionDays: 60,
    logger: false,
    google: fake,
    mapsCaps: { routes: 4, autocomplete: 2, placeDetails: 2 },
  });
  const maps = async (method: 'GET' | 'POST', url: string, body?: unknown) => {
    const res = await mapsApp.inject({ method, url, remoteAddress: '203.0.113.200', ...(body ? { payload: body as object } : {}) });
    return { status: res.statusCode, json: JSON.parse(res.body) as Record<string, any> };
  };

  assert.equal((await maps('GET', '/maps/status')).json.google, true);
  const token = '3f2b8c1e-9d4a-4c7b-8e6f-1a2b3c4d5e6f';
  const suggestions = await maps('POST', '/maps/autocomplete', { input: 'Ozark', sessionToken: token, near: { latitude: 35, longitude: -94 } });
  assert.equal(suggestions.status, 200);
  assert.equal(suggestions.json.suggestions[0].placeId, 'ozark-ar');
  const place = await maps('POST', '/maps/place', { placeId: 'ozark-ar', sessionToken: token });
  assert.equal(place.json.address, 'Ozark, AR, USA');
  ok('place search and lookup go through Google');

  assert.equal((await maps('POST', '/maps/autocomplete', { input: 'x', sessionToken: 'bad token!' })).status, 400);
  assert.equal((await maps('POST', '/maps/routes', { from: { latitude: 200, longitude: 0 }, to: { latitude: 0, longitude: 0 } })).status, 400);
  const missing = await maps('POST', '/maps/place', { placeId: 'missing', sessionToken: token });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'place_not_found');
  ok('bad searches and unknown places get clear errors');

  const routes = await maps('POST', '/maps/routes', { from: { latitude: 35, longitude: -94 }, to: { latitude: 35.3, longitude: -94 } });
  assert.equal(routes.status, 200);
  assert.equal(routes.json.normal[0].polyline, straight);
  assert.equal(routes.json.noHighways[0].polyline, twisty);
  assert.equal(routes.json.noHighways[0].durationSeconds, 3000);
  ok('route search returns both the normal and the highway-free routes');

  failNext = true;
  const googleDown = await maps('POST', '/maps/routes', { from: { latitude: 35, longitude: -94 }, to: { latitude: 35.3, longitude: -94 } });
  assert.equal(googleDown.status, 503);
  assert.equal(googleDown.json.error.code, 'maps_unavailable');
  ok('a Google failure tells the app to use Apple maps');

  // Both route searches used the routes allowance of 4 (2 calls each).
  assert.equal((await maps('GET', '/maps/status')).json.google, false);
  const callsBefore = calls.length;
  const capped = await maps('POST', '/maps/routes', { from: { latitude: 35, longitude: -94 }, to: { latitude: 35.3, longitude: -94 } });
  assert.equal(capped.json.error.code, 'maps_unavailable');
  assert.equal(calls.length, callsBefore);
  const month = billingMonth();
  const row = mapsDb.prepare('SELECT count FROM maps_usage WHERE month = ? AND sku = ?').get(month, 'routes') as { count: number };
  assert.equal(row.count, 4);
  ok('at the monthly cap the server stops calling Google');

  assert.equal(billingMonth(new Date('2026-11-01T05:00:00Z')), '2026-10');
  assert.equal(billingMonth(new Date('2026-11-01T08:00:00Z')), '2026-11');
  ok('usage is counted by the Pacific-time month Google bills by');

  await mapsApp.close();
  mapsDb.close();
}

await app.close();
db.close();
console.log(`\nAll ${passed} checks passed.`);
