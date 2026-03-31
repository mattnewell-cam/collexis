'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AUTH_EMAIL_COOKIE, normalizeEmail } from '@/lib/authSession';
import type { Credentials, UserAccount, UserProfile } from '@/types/account';

interface StoredAccount extends UserAccount {
  password: string;
}

interface AuthStore {
  accounts: Record<string, StoredAccount>;
  currentUserEmail: string | null;
}

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: UserAccount | null;
  isLoading: boolean;
  signIn: (credentials: Credentials) => AuthResult;
  signUp: (credentials: Credentials) => AuthResult;
  signOut: () => void;
  completeProfile: (profile: UserProfile) => AuthResult;
  updateProfile: (profile: UserProfile) => AuthResult;
  changePassword: (currentPassword: string, nextPassword: string) => AuthResult;
}

const STORAGE_KEY = 'collexis-auth-store';
const CHANGE_EVENT = 'collexis-auth-store-change';

const emptyProfile = (): UserProfile => ({
  fullName: '',
  role: '',
  company: '',
  industry: '',
  phone: '',
  website: '',
});

const defaultStore: AuthStore = {
  accounts: {},
  currentUserEmail: null,
};

let cachedStoreValue: string | null = null;
let cachedStoreSnapshot: AuthStore = defaultStore;

const AuthContext = createContext<AuthContextValue | null>(null);

const sanitizeProfile = (profile: UserProfile): UserProfile => ({
  fullName: profile.fullName.trim(),
  role: profile.role.trim(),
  company: profile.company.trim(),
  industry: profile.industry.trim(),
  phone: profile.phone.trim(),
  website: profile.website.trim(),
});

const isProfileComplete = (profile: UserProfile) =>
  Boolean(profile.fullName && profile.role && profile.company && profile.industry);

const toPublicUser = (account: StoredAccount): UserAccount => ({
  email: account.email,
  createdAt: account.createdAt,
  profileCompleted: account.profileCompleted,
  profile: { ...account.profile },
});

const readStore = (): AuthStore => {
  if (typeof window === 'undefined') {
    return defaultStore;
  }

  const rawStore = window.localStorage.getItem(STORAGE_KEY);

  if (!rawStore) {
    cachedStoreValue = null;
    cachedStoreSnapshot = defaultStore;
    return defaultStore;
  }

  if (rawStore === cachedStoreValue) {
    return cachedStoreSnapshot;
  }

  try {
    const parsed = JSON.parse(rawStore) as Partial<AuthStore>;

    cachedStoreValue = rawStore;
    cachedStoreSnapshot = {
      accounts: parsed.accounts ?? {},
      currentUserEmail: parsed.currentUserEmail ?? null,
    };
    return cachedStoreSnapshot;
  } catch {
    cachedStoreValue = null;
    cachedStoreSnapshot = defaultStore;
    return defaultStore;
  }
};

const writeStore = (store: AuthStore) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const emitStoreChange = () => {
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const syncAuthCookie = (email: string | null) => {
  if (typeof document === 'undefined') {
    return;
  }

  if (email) {
    document.cookie = `${AUTH_EMAIL_COOKIE}=${encodeURIComponent(email)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    return;
  }

  document.cookie = `${AUTH_EMAIL_COOKIE}=; path=/; max-age=0; samesite=lax`;
};

const subscribeToHydration = () => () => undefined;

const subscribeToAuthStore = (callback: () => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleStoreChange = () => callback();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener(CHANGE_EVENT, handleStoreChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const isHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const store = useSyncExternalStore(subscribeToAuthStore, readStore, () => defaultStore);
  const isLoading = !isHydrated;

  const currentAccount = store.currentUserEmail
    ? store.accounts[store.currentUserEmail]
    : null;

  const user = currentAccount ? toPublicUser(currentAccount) : null;

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    syncAuthCookie(store.currentUserEmail);
  }, [isHydrated, store.currentUserEmail]);

  const commitStore = (updater: (currentStore: AuthStore) => AuthStore) => {
    const nextStore = updater(readStore());
    writeStore(nextStore);
    emitStoreChange();
  };

  const signIn = ({ email, password }: Credentials): AuthResult => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return { ok: false, error: 'Enter both your email and password.' };
    }

    const account = store.accounts[normalizedEmail];

    if (!account || account.password !== password) {
      return { ok: false, error: 'We could not match that email and password.' };
    }

    commitStore(currentStore => ({
      ...currentStore,
      currentUserEmail: normalizedEmail,
    }));
    syncAuthCookie(normalizedEmail);

    return { ok: true };
  };

  const signUp = ({ email, password }: Credentials): AuthResult => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return { ok: false, error: 'Enter an email and password to create your account.' };
    }

    if (password.length < 8) {
      return { ok: false, error: 'Use at least 8 characters for the password.' };
    }

    if (store.accounts[normalizedEmail]) {
      return { ok: false, error: 'That email already has an account. Sign in instead.' };
    }

    const account: StoredAccount = {
      email: normalizedEmail,
      password,
      createdAt: new Date().toISOString(),
      profileCompleted: false,
      profile: emptyProfile(),
    };

    commitStore(currentStore => ({
      accounts: {
        ...currentStore.accounts,
        [normalizedEmail]: account,
      },
      currentUserEmail: normalizedEmail,
    }));
    syncAuthCookie(normalizedEmail);

    return { ok: true };
  };

  const updateAccountProfile = (profile: UserProfile): AuthResult => {
    if (!store.currentUserEmail) {
      return { ok: false, error: 'Sign in again to continue.' };
    }

    const currentAccount = store.accounts[store.currentUserEmail];

    if (!currentAccount) {
      return { ok: false, error: 'Sign in again to continue.' };
    }

    const sanitizedProfile = sanitizeProfile(profile);

    if (!isProfileComplete(sanitizedProfile)) {
      return { ok: false, error: 'Add your name, role, company, and industry first.' };
    }

    commitStore(currentStore => ({
      ...currentStore,
      accounts: {
        ...currentStore.accounts,
        [store.currentUserEmail as string]: {
          ...currentAccount,
          profile: sanitizedProfile,
          profileCompleted: true,
        },
      },
    }));

    return { ok: true };
  };

  const signOut = () => {
    commitStore(currentStore => ({
      ...currentStore,
      currentUserEmail: null,
    }));
    syncAuthCookie(null);
  };

  const changePassword = (currentPassword: string, nextPassword: string): AuthResult => {
    if (!store.currentUserEmail) {
      return { ok: false, error: 'Sign in again to change your password.' };
    }

    const currentAccount = store.accounts[store.currentUserEmail];

    if (!currentAccount || currentAccount.password !== currentPassword) {
      return { ok: false, error: 'Your current password does not match.' };
    }

    if (nextPassword.length < 8) {
      return { ok: false, error: 'Use at least 8 characters for the new password.' };
    }

    commitStore(currentStore => ({
      ...currentStore,
      accounts: {
        ...currentStore.accounts,
        [store.currentUserEmail as string]: {
          ...currentAccount,
          password: nextPassword,
        },
      },
    }));

    return { ok: true };
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
    completeProfile: updateAccountProfile,
    updateProfile: updateAccountProfile,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
};
