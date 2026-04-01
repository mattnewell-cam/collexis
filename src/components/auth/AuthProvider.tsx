'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';
import type { Credentials, UserAccount, UserProfile } from '@/types/account';

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: UserAccount | null;
  isLoading: boolean;
  signIn: (credentials: Credentials) => Promise<AuthResult>;
  signUp: (credentials: Credentials) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  completeProfile: (profile: UserProfile) => Promise<AuthResult>;
  updateProfile: (profile: UserProfile) => Promise<AuthResult>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<AuthResult>;
}

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

interface DbProfile {
  full_name: string;
  role: string;
  company: string;
  industry: string;
  phone: string;
  website: string;
  profile_completed: boolean;
  created_at: string;
}

function dbProfileToAccount(email: string, row: DbProfile): UserAccount {
  return {
    email,
    createdAt: row.created_at,
    profileCompleted: row.profile_completed,
    profile: {
      fullName: row.full_name,
      role: row.role,
      company: row.company,
      industry: row.industry,
      phone: row.phone,
      website: row.website,
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

  const supabase = supabaseRef.current;

  const fetchAndSetUser = useCallback(
    async (email: string, userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single<DbProfile>();

      if (error || !data) {
        setUser({ email, createdAt: new Date().toISOString(), profileCompleted: false, profile: { fullName: '', role: '', company: '', industry: '', phone: '', website: '' } });
        return;
      }

      setUser(dbProfileToAccount(email, data));
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    const syncUserFromSession = (session: Session | null) => {
      void (async () => {
        try {
          if (session?.user?.email && session.user.id) {
            await fetchAndSetUser(session.user.email, session.user.id);
          } else {
            setUser(null);
          }
        } catch (error) {
          console.error('[AuthProvider] Failed during auth state change:', error);
          setUser(null);
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      })();
    };

    const loadInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session?.user?.email && session.user.id) {
          await fetchAndSetUser(session.user.email, session.user.id);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('[AuthProvider] Failed to load initial session:', error);
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    // Safety net: never leave the app stuck loading beyond 8 seconds
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 8000);

    void loadInitialSession().finally(() => clearTimeout(loadingTimeout));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.replace('/reset-password');
        return;
      }

      // Supabase advises against awaiting follow-up client work inside this
      // callback because it can block subsequent auth calls.
      setTimeout(() => {
        if (!cancelled) {
          syncUserFromSession(session);
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, fetchAndSetUser]);

  const signIn = async ({ email, password }: Credentials): Promise<AuthResult> => {
    if (!email || !password) {
      return { ok: false, error: 'Enter both your email and password.' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { ok: false, error: 'We could not match that email and password.' };
    }

    return { ok: true };
  };

  const signUp = async ({ email, password }: Credentials): Promise<AuthResult> => {
    if (!email || !password) {
      return { ok: false, error: 'Enter an email and password to create your account.' };
    }

    if (password.length < 8) {
      return { ok: false, error: 'Use at least 8 characters for the password.' };
    }

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return { ok: false, error: 'That email already has an account. Sign in instead.' };
      }
      return { ok: false, error: error.message };
    }

    return { ok: true };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const saveProfile = async (profile: UserProfile, profileCompleted: boolean): Promise<AuthResult> => {
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return { ok: false, error: 'Sign in again to continue.' };
    }

    const sanitized = sanitizeProfile(profile);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: sanitized.fullName,
        role: sanitized.role,
        company: sanitized.company,
        industry: sanitized.industry,
        phone: sanitized.phone,
        website: sanitized.website,
        profile_completed: profileCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authUser.id);

    if (error) {
      return { ok: false, error: 'We could not save your details.' };
    }

    setUser(current =>
      current
        ? { ...current, profile: sanitized, profileCompleted }
        : null,
    );

    return { ok: true };
  };

  const completeProfile = async (profile: UserProfile): Promise<AuthResult> => {
    const sanitized = sanitizeProfile(profile);

    if (!isProfileComplete(sanitized)) {
      return { ok: false, error: 'Add your name, role, company, and industry first.' };
    }

    return saveProfile(sanitized, true);
  };

  const updateProfile = async (profile: UserProfile): Promise<AuthResult> => {
    const sanitized = sanitizeProfile(profile);

    if (!isProfileComplete(sanitized)) {
      return { ok: false, error: 'Add your name, role, company, and industry first.' };
    }

    return saveProfile(sanitized, true);
  };

  const requestPasswordReset = async (email: string): Promise<AuthResult> => {
    if (!email) {
      return { ok: false, error: 'Enter your email address.' };
    }

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      return { ok: false, error: 'Could not send the reset email.' };
    }

    return { ok: true };
  };

  const changePassword = async (currentPassword: string, nextPassword: string): Promise<AuthResult> => {
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser?.email) {
      return { ok: false, error: 'Sign in again to change your password.' };
    }

    // Verify current password by re-authenticating
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: currentPassword,
    });

    if (verifyError) {
      return { ok: false, error: 'Your current password does not match.' };
    }

    if (nextPassword.length < 8) {
      return { ok: false, error: 'Use at least 8 characters for the new password.' };
    }

    const { error } = await supabase.auth.updateUser({ password: nextPassword });

    if (error) {
      return { ok: false, error: 'We could not update your password.' };
    }

    return { ok: true };
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    completeProfile,
    updateProfile,
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
