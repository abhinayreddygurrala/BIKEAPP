import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiError, apiRequest, isApiConfigured } from '@/lib/apiClient';
import { deleteSecureItem, getSecureItem, setSecureItem } from '@/lib/secureStorage';

export type AccountUser = {
  id: string;
  username: string;
  email: string;
  phone: string;
  createdAt: string;
};

export type SignUpFields = { username: string; email: string; phone: string; password: string };

export type UsernameCheck = { available: boolean; reason?: string; message?: string };

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  user: AccountUser | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (fields: SignUpFields) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  checkUsername: (username: string) => Promise<UsernameCheck>;
  /** A request to the Odomap server as the signed-in user (signs out on a 401). */
  authedRequest: <T>(path: string, options?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }) => Promise<T>;
};

const TOKEN_KEY = 'odomap.session.token';
const USER_KEY = 'odomap.session.user';
// Left by the old "Skip for now" option; only ever deleted now.
const LEGACY_SKIPPED_KEY = 'odomap.signin.skipped';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AccountUser | null>(null);
  const tokenRef = useRef<string | null>(null);

  const saveSession = useCallback(async (token: string, nextUser: AccountUser) => {
    tokenRef.current = token;
    setUser(nextUser);
    setStatus('signedIn');
    await Promise.all([setSecureItem(TOKEN_KEY, token), setSecureItem(USER_KEY, JSON.stringify(nextUser))]);
  }, []);

  // Signing out (or deleting the account, or a session expiring) brings the
  // opening sign-in screen back: Odomap needs an account to be used.
  const clearSession = useCallback(async () => {
    tokenRef.current = null;
    setUser(null);
    setStatus('signedOut');
    await Promise.all([deleteSecureItem(TOKEN_KEY), deleteSecureItem(USER_KEY)]);
  }, []);

  // Anything that needs the login token goes through here, so an expired or
  // revoked session (from another device, say) signs this one out cleanly.
  const authedRequest = useCallback(
    async <T,>(path: string, options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}): Promise<T> => {
      try {
        return await apiRequest<T>(path, { ...options, token: tokenRef.current });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await clearSession();
        throw error;
      }
    },
    [clearSession]
  );

  useEffect(() => {
    (async () => {
      void deleteSecureItem(LEGACY_SKIPPED_KEY);
      const [token, cached] = await Promise.all([getSecureItem(TOKEN_KEY), getSecureItem(USER_KEY)]);
      if (!token) {
        setStatus('signedOut');
        return;
      }

      // Signed in straight away from what's saved on the phone: this app is
      // for riding, often with no signal, so it must never wait on (or be
      // blocked by) the network to open.
      tokenRef.current = token;
      if (cached) {
        try {
          setUser(JSON.parse(cached) as AccountUser);
        } catch {
          // A corrupt cache just means we show less until the check below.
        }
      }
      setStatus('signedIn');

      if (!isApiConfigured()) return;
      try {
        const { user: fresh } = await authedRequest<{ user: AccountUser }>('/auth/me');
        setUser(fresh);
        await setSecureItem(USER_KEY, JSON.stringify(fresh));
      } catch {
        // Offline or the server is down: stay signed in. A 401 is handled in
        // authedRequest, which signs out.
      }
    })();
  }, [authedRequest]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn: async (identifier, password) => {
        const result = await apiRequest<{ token: string; user: AccountUser }>('/auth/signin', {
          method: 'POST',
          body: { identifier, password },
        });
        await saveSession(result.token, result.user);
      },
      signUp: async (fields) => {
        const result = await apiRequest<{ token: string; user: AccountUser }>('/auth/signup', {
          method: 'POST',
          body: fields,
        });
        await saveSession(result.token, result.user);
      },
      signOut: async () => {
        // Best effort: even if the server can't be reached, signing out on
        // this phone must always work.
        try {
          await apiRequest('/auth/signout', { method: 'POST', token: tokenRef.current });
        } catch {
          // Ignored on purpose.
        }
        await clearSession();
      },
      changePassword: async (currentPassword, newPassword) => {
        await authedRequest('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      },
      deleteAccount: async (password) => {
        await authedRequest('/auth/account', { method: 'DELETE', body: { password } });
        await clearSession();
      },
      checkUsername: (username) =>
        apiRequest<UsernameCheck>(`/auth/username-available?username=${encodeURIComponent(username)}`),
      authedRequest,
    }),
    [status, user, saveSession, clearSession, authedRequest]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
