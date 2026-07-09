export const DEFAULT_EXCLUDED_PATIENT_EMAIL_DOMAINS = ['example.com'] as const;

export function withDefaultPatientEmailExclusions<T extends object>(input: T): T & {
  excludedPatientEmailDomains: string[];
} {
  return {
    ...input,
    excludedPatientEmailDomains: [...DEFAULT_EXCLUDED_PATIENT_EMAIL_DOMAINS],
  };
}

export function isDefaultExcludedPatientEmail(email: string | null | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return DEFAULT_EXCLUDED_PATIENT_EMAIL_DOMAINS.some((domain) =>
    normalizedEmail.endsWith(`@${domain}`),
  );
}
