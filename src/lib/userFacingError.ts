const TECHNICAL_ERROR_PATTERNS = [
  /client error\b/i,
  /server error\b/i,
  /for url\b/i,
  /https?:\/\//i,
  /httpx\./i,
  /traceback\b/i,
  /schema cache\b/i,
  /<html/i,
  /<!doctype/i,
];

export function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (!message) {
    return fallback;
  }

  if (TECHNICAL_ERROR_PATTERNS.some(pattern => pattern.test(message))) {
    return fallback;
  }

  return message;
}
