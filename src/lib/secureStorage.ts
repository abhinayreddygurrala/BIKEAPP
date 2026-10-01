// Loaded via require() in try/catch rather than a static import, per this
// project's convention for native modules (see useLeanAngleTracker.ts): if
// the module fails to register at startup, login simply won't persist across
// launches instead of crashing navigation app-wide.
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require('expo-secure-store');
} catch (e) {
  console.error('[secureStorage] expo-secure-store native module unavailable', e);
}

const memoryFallback = new Map<string, string>();

/** Keychain-backed key/value storage for things like the login token. */
export async function getSecureItem(key: string): Promise<string | null> {
  if (SecureStore) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.error('[secureStorage] read failed', e);
    }
  }
  return memoryFallback.get(key) ?? null;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  memoryFallback.set(key, value);
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      console.error('[secureStorage] write failed', e);
    }
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  memoryFallback.delete(key);
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.error('[secureStorage] delete failed', e);
    }
  }
}
