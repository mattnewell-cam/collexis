'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import type { UserProfile } from '@/types/account';

const defaultProfile: UserProfile = {
  fullName: '',
  role: '',
  company: '',
  industry: '',
  phone: '',
  website: '',
};

export default function OnboardingForm() {
  const { user, completeProfile } = useAuth();
 
  if (!user) {
    return null;
  }

  return (
    <OnboardingFields
      key={user.email}
      initialProfile={user.profile}
      completeProfile={completeProfile}
    />
  );
}

function OnboardingFields({
  initialProfile,
  completeProfile,
}: {
  initialProfile: UserProfile;
  completeProfile: (profile: UserProfile) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile ?? defaultProfile);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof UserProfile, value: string) => {
    setProfile(currentProfile => ({
      ...currentProfile,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const result = await completeProfile(profile);

    if (!result.ok) {
      setError(result.error ?? 'We could not save your details.');
      return;
    }

    window.location.replace('/console');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f9fffe_0%,#f3f8fb_100%)] px-6 py-10">
      <div
        className="pointer-events-none absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(42,191,170,0.16) 0%, transparent 68%)' }}
      />

      <div className="relative mx-auto max-w-5xl rounded-[36px] border border-white/80 bg-white/90 p-6 shadow-[0_32px_90px_-40px_rgba(30,155,184,0.38)] backdrop-blur sm:p-8 lg:grid lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
        <section className="border-b border-slate-100 pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10">
          <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Step 2 of 2
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
            Add your company details.
          </h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-slate-600">
            We use this to personalise the account area and make it clear which business the console belongs to.
          </p>
        </section>

        <section className="pt-8 lg:pt-0">
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Full name</span>
              <input
                type="text"
                required
                value={profile.fullName}
                onChange={event => updateField('fullName', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                placeholder="Alex Morgan"
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
                placeholder="Operations Director"
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
                placeholder="Property services"
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
                placeholder="Holt Commercial Ltd"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Phone</span>
              <input
                type="tel"
                value={profile.phone}
                onChange={event => updateField('phone', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                placeholder="+44 20 7946 0821"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Website</span>
              <input
                type="url"
                value={profile.website}
                onChange={event => updateField('website', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                placeholder="https://company.com"
              />
            </label>

            {error ? (
              <div className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="sm:col-span-2 flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-2xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-95 active:opacity-90"
                style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
              >
                Save and enter console
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
