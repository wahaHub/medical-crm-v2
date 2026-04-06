/**
 * Shared helpers for reading typed values out of `Record<string, unknown>` structured-data blobs.
 */

export type MedicalFormStatus = 'NOT_STARTED' | 'SKIPPED' | 'SUBMITTED';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Returns the string value unchanged if it is non-empty after trimming,
 * otherwise returns null.  The original (un-trimmed) value is preserved.
 */
export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function asNullableDate(value: unknown): Date | null {
  if (typeof value === 'string' || value instanceof Date) {
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
