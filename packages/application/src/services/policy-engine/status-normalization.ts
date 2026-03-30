export function normalizePolicyState(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function isMissingDocumentStatus(value: string | null | undefined): boolean {
  return ['NOT_STARTED', 'NONE', 'NOT_UPLOADED', 'REQUESTED'].includes(normalizePolicyState(value));
}
