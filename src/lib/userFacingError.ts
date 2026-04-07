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
  let message = '';

  if (typeof error === 'string') {
    message = error.trim();
  } else if (error instanceof Error) {
    message = error.message.trim();
  } else {
    return fallback;
  }

  if (!message) {
    return fallback;
  }

  if (TECHNICAL_ERROR_PATTERNS.some(pattern => pattern.test(message))) {
    return fallback;
  }

  return message;
}
