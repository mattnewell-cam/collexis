'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import type { UserProfile } from '@/types/account';

type Tab = 'profile' | 'security';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
];

const emptyPasswordState = {
  currentPassword: '',
  nextPassword: '',
  confirmPassword: '',
};

export default function AccountSettingsView() {
  const { user, updateProfile, changePassword, signOut } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <AccountSettingsPanel
      key={user.email}
      user={user}
      updateProfile={updateProfile}
      changePassword={changePassword}
      signOut={signOut}
    />
  );
}

function AccountSettingsPanel({
  user,
  updateProfile,
  changePassword,
  signOut,
}: {
  user: {
    email: string;
    profile: UserProfile;
  };
  updateProfile: (profile: UserProfile) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<UserProfile>(user.profile);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordState, setPasswordState] = useState(emptyPasswordState);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const activeTab = useMemo<Tab>(() => {
    const tab = searchParams.get('tab');
    return tabs.some(item => item.id === tab) ? (tab as Tab) : 'profile';
  }, [searchParams]);

  const updateField = (field: keyof UserProfile, value: string) => {
    setProfile(currentProfile => ({
      ...currentProfile,
      [field]: value,
    }));
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);

    const result = await updateProfile(profile);

    if (!result.ok) {
      setProfileError(result.error ?? 'We could not save those details.');
      return;
    }

    setProfileMessage('Details saved.');
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (passwordState.nextPassword !== passwordState.confirmPassword) {
      setPasswordError('New passwords need to match.');
      return;
    }

    const result = await changePassword(passwordState.currentPassword, passwordState.nextPassword);

    if (!result.ok) {
      setPasswordError(result.error ?? 'We could not update your password.');
      return;
    }

    setPasswordState(emptyPasswordState);
    setPasswordMessage('Password updated.');
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.replace('/');
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_-44px_rgba(15,23,42,0.2)]">
        <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-teal-700">Account</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Settings</h1>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900">{user.profile.company}</p>
              <p className="mt-1">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r lg:p-5">
            <nav className="grid gap-2">
              {tabs.map(tab => {
                const isActive = tab.id === activeTab;

                return (
                  <Link
                    key={tab.id}
                    href={`/console/account?tab=${tab.id}`}
                    className={`rounded-2xl px-4 py-3 text-left transition ${
                      isActive
                        ? 'bg-white text-slate-950 shadow-sm ring-1 ring-teal-100'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <div className="text-sm font-semibold">{tab.label}</div>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <section className="p-6 sm:p-8">
            {activeTab === 'profile' ? (
              <form className="grid gap-5 sm:grid-cols-2" onSubmit={handleProfileSubmit}>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Full name</span>
                  <input
                    type="text"
                    required
                    value={profile.fullName}
                    onChange={event => updateField('fullName', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Role</span>
                  <input
                    type="text"
                    required
                    value={profile.role}
                    onChange={event => updateField('role', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Phone</span>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={event => updateField('phone', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Website</span>
                  <input
                    type="url"
                    value={profile.website}
                    onChange={event => updateField('website', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Company</span>
                  <input
                    type="text"
                    required
                    value={profile.company}
                    onChange={event => updateField('company', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Industry</span>
                  <input
                    type="text"
                    required
                    value={profile.industry}
                    onChange={event => updateField('industry', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Account email</span>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 outline-none"
                  />
                </label>

                {profileError ? (
                  <div className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {profileError}
                  </div>
                ) : null}

                {profileMessage ? (
                  <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {profileMessage}
                  </div>
                ) : null}

                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-2xl px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 active:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                  >
                    Save profile
                  </button>
                </div>
              </form>
            ) : null}

            {activeTab === 'security' ? (
              <div className="space-y-8">
                <form className="grid gap-5 sm:grid-cols-2" onSubmit={handlePasswordSubmit}>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Current password</span>
                    <input
                      type="password"
                      required
                      value={passwordState.currentPassword}
                      onChange={event => setPasswordState(currentState => ({
                        ...currentState,
                        currentPassword: event.target.value,
                      }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordState.nextPassword}
                      onChange={event => setPasswordState(currentState => ({
                        ...currentState,
                        nextPassword: event.target.value,
                      }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Confirm new password</span>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordState.confirmPassword}
                      onChange={event => setPasswordState(currentState => ({
                        ...currentState,
                        confirmPassword: event.target.value,
                      }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </label>

                  {passwordError ? (
                    <div className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {passwordError}
                    </div>
                  ) : null}

                  {passwordMessage ? (
                    <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {passwordMessage}
                    </div>
                  ) : null}

                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      className="rounded-2xl px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 active:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                    >
                      Update password
                    </button>
                  </div>
                </form>

                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <h2 className="text-lg font-semibold text-slate-950">Session</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Signed in as {user.email}
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-5 rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
