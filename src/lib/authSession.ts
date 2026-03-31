export const AUTH_EMAIL_COOKIE = 'collexis-auth-email';
export const LEGACY_JOBS_OWNER_EMAIL = 'matthew_newell@outlook.com';

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function readAuthenticatedEmail(cookieStore?: CookieReader) {
  const rawEmail = cookieStore?.get(AUTH_EMAIL_COOKIE)?.value;
  return rawEmail ? normalizeEmail(decodeURIComponent(rawEmail)) : null;
}
