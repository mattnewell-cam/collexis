export function normalizePhoneForComparison(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const hasPlusPrefix = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  return hasPlusPrefix ? `+${digits}` : digits;
}

export function normalizeUkPhoneForTelnyx(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('44')) {
    return `+${digits}`;
  }

  if (digits.startsWith('0')) {
    return `+44${digits.slice(1)}`;
  }

  return `+${digits}`;
}
