export function normalizeCommunicationDate(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : value;
}

export function parseCommunicationDate(value: string) {
  const normalized = normalizeCommunicationDate(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (match) {
    const [, year, month, day] = match;
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
    parsedDate.setHours(0, 0, 0, 0);
    return parsedDate;
  }

  const fallbackDate = new Date(value);
  if (Number.isNaN(fallbackDate.getTime())) {
    return null;
  }
  fallbackDate.setHours(0, 0, 0, 0);
  return fallbackDate;
}
