export function formatDate(date: Date | string, locale = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function parseDate(input: string): Date {
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d;
}
