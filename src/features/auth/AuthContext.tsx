import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

// Lets the in-app browser sheet close itself once the OAuth redirect lands
// back on our custom scheme, instead of staying open.
WebBrowser.maybeCompleteAuthSession();

const oauthRedirectTo = makeRedirectUri();

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
      },
      signInWithGoogle: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
        });
        if (error) return { error: error.message };
        if (!data.url) return { error: 'No OAuth URL returned' };

        const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);
        if (result.type !== 'success') {
          return result.type === 'cancel' ? { error: null } : { error: 'Google sign-in failed' };
        }

        try {
          await createSessionFromUrl(result.url);
          return { error: null };
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Google sign-in failed' };
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
