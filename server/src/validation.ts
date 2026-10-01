import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

// Request-body shapes. These only bound the size/type of what arrives; the
// real rules (format, uniqueness, password strength) live in the functions
// below so every endpoint reports problems the same way.
export const signUpBody = z.object({
  username: z.string().max(64),
  email: z.string().max(320),
  phone: z.string().max(40),
  password: z.string().max(1024),
});

export const signInBody = z.object({
  identifier: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().max(1024),
});

export const deleteAccountBody = z.object({
  password: z.string().min(1).max(1024),
});

export type FieldError = { field: string; code: string; message: string };

// Starts with a letter so a username can never be mistaken for a phone number
// when someone signs in with "whatever they typed".
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'odomap', 'official', 'moderator', 'mod',
  'system', 'staff', 'team', 'security', 'info', 'contact', 'abuse', 'postmaster', 'webmaster',
  'api', 'www', 'null', 'undefined', 'anonymous', 'deleted', 'everyone', 'owner',
]);

export function checkUsername(raw: string): { ok: true; username: string } | { ok: false; error: FieldError } {
  const username = raw.trim();
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: {
        field: 'username',
        code: 'invalid_username',
        message: 'Usernames are 3–20 characters, start with a letter, and use only letters, numbers, and underscores.',
      },
    };
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    return {
      ok: false,
      error: { field: 'username', code: 'reserved_username', message: 'That username isn’t available.' },
    };
  }
  return { ok: true, username };
}

export function normalizeEmail(raw: string): { ok: true; email: string } | { ok: false; error: FieldError } {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      error: { field: 'email', code: 'invalid_email', message: 'Enter a valid email address.' },
    };
  }
  return { ok: true, email };
}

/** Defaults to US numbers when no country code is typed; stores E.164 (+15015551234). */
export function normalizePhone(raw: string): { ok: true; phone: string } | { ok: false; error: FieldError } {
  const parsed = parsePhoneNumberFromString(raw.trim(), 'US');
  if (!parsed || !parsed.isValid()) {
    return {
      ok: false,
      error: { field: 'phone', code: 'invalid_phone', message: 'Enter a valid phone number.' },
    };
  }
  return { ok: true, phone: parsed.number };
}

// The handful of passwords that show up in nearly every breach. Not a
// substitute for a real breached-password check, just a cheap floor.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwertyui', 'qwerty123', 'qwertyuiop', 'iloveyou', 'letmein1', 'welcome1',
  'abc12345', 'monkey123', 'dragon123', 'football1', 'baseball1', 'motorcycle', 'motorcycle1',
  'harley123', 'ducati123', 'triumph123', 'odomap123', '11111111', '00000000', 'asdfghjk',
]);

export function checkPassword(
  password: string,
  context: { username?: string; email?: string }
): FieldError | null {
  if (password.length < 8) {
    return { field: 'password', code: 'weak_password', message: 'Use at least 8 characters.' };
  }
  if (password.length > 128) {
    return { field: 'password', code: 'weak_password', message: 'Use 128 characters or fewer.' };
  }
  const lowered = password.toLowerCase();
  const emailName = context.email?.split('@')[0];
  if (
    COMMON_PASSWORDS.has(lowered) ||
    lowered === context.username?.toLowerCase() ||
    (emailName && lowered === emailName)
  ) {
    return { field: 'password', code: 'weak_password', message: 'That password is too easy to guess. Pick something less common.' };
  }
  return null;
}

/** How someone typed their login: an email, a phone number, or a username. */
export function classifyIdentifier(raw: string): { kind: 'email' | 'phone' | 'username'; value: string } {
  const value = raw.trim();
  if (value.includes('@')) return { kind: 'email', value: value.toLowerCase() };
  // Usernames always start with a letter, so anything starting with a digit,
  // "+", "(" or similar is a phone number.
  if (/^[+(\d]/.test(value)) {
    const parsed = parsePhoneNumberFromString(value, 'US');
    if (parsed?.isValid()) return { kind: 'phone', value: parsed.number };
  }
  return { kind: 'username', value: value.toLowerCase() };
}
