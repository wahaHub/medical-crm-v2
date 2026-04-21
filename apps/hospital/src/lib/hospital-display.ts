type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
  fallback?: string,
) => string;

const STATUS_LABELS: Record<string, { key: string; fallback: string }> = {
  NEW: { key: 'hospital.common.statuses.new', fallback: 'New' },
  SCHEDULED: { key: 'hospital.common.statuses.scheduled', fallback: 'Scheduled' },
  ACTIVE: { key: 'hospital.common.statuses.active', fallback: 'Active' },
  ASSIGNED: { key: 'hospital.common.statuses.assigned', fallback: 'Assigned' },
  UNASSIGNED: { key: 'hospital.common.statuses.unassigned', fallback: 'Unassigned' },
  IN_PROGRESS: { key: 'hospital.common.statuses.inProgress', fallback: 'In Progress' },
  COMPLETED: { key: 'hospital.common.statuses.completed', fallback: 'Completed' },
  CANCELLED: { key: 'hospital.common.statuses.cancelled', fallback: 'Cancelled' },
  NO_SHOW: { key: 'hospital.common.statuses.noShow', fallback: 'No Show' },
  PENDING_REVIEW: { key: 'hospital.common.statuses.pendingReview', fallback: 'Pending Review' },
  APPROVED: { key: 'hospital.common.statuses.approved', fallback: 'Approved' },
  REJECTED: { key: 'hospital.common.statuses.rejected', fallback: 'Rejected' },
  UNKNOWN: { key: 'hospital.common.statuses.unknown', fallback: 'Unknown' },
};

const REGION_ALIASES: Record<string, string> = {
  US: 'US',
  USA: 'US',
  'UNITED STATES': 'US',
  UK: 'GB',
  GB: 'GB',
  'UNITED KINGDOM': 'GB',
  CN: 'CN',
  CHINA: 'CN',
  AU: 'AU',
  AUSTRALIA: 'AU',
  CA: 'CA',
  CANADA: 'CA',
  JP: 'JP',
  JAPAN: 'JP',
  KR: 'KR',
  'SOUTH KOREA': 'KR',
  DE: 'DE',
  GERMANY: 'DE',
  FR: 'FR',
  FRANCE: 'FR',
  BR: 'BR',
  BRAZIL: 'BR',
  IN: 'IN',
  INDIA: 'IN',
  SG: 'SG',
  SINGAPORE: 'SG',
  TH: 'TH',
  THAILAND: 'TH',
  AE: 'AE',
  UAE: 'AE',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  ZH_CN: 'zh-Hans',
  ZH_HANS: 'zh-Hans',
  ZH_HANT: 'zh-Hant',
  PT_BR: 'pt-BR',
};

function getLocalizedUnknownLabel(t?: TranslateFn): string {
  return t?.('hospital.common.unknown', undefined, 'Unknown') ?? '';
}

function looksLikeCode(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Z]{2,4}$/.test(trimmed) || /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,2}$/.test(trimmed);
}

function looksLikeReadableLabel(value: string): boolean {
  const trimmed = value.trim();
  return /^[\p{L}][\p{L}\s.'-]{1,}$/u.test(trimmed) && !looksLikeCode(trimmed);
}

function normalizeCodeToken(value: string): string {
  return value.trim().replace(/[_\s]+/g, '-').toLowerCase();
}

export function getHospitalStatusLabel(status: string | null | undefined, t: TranslateFn): string {
  const normalized = status?.trim().toUpperCase() || 'UNKNOWN';
  const meta = STATUS_LABELS[normalized];

  if (meta) {
    return t(meta.key, undefined, meta.fallback);
  }

  return t('hospital.common.statuses.unknown', undefined, 'Unknown');
}

export function formatDurationMinutesLabel(minutes: number, t: TranslateFn): string {
  return t('hospital.common.durationMinutes', { count: minutes }, `${minutes} min`);
}

export function getLocalizedCountryLabel(
  country: string | null | undefined,
  locale: string,
  t?: TranslateFn,
): string {
  if (!country) return '';
  if (looksLikeReadableLabel(country)) return country.trim();

  const normalized = country.trim().toUpperCase();
  const regionCode =
    REGION_ALIASES[normalized] ??
    (/^[A-Z]{2}$/.test(normalized) ? normalized : undefined);
  const fallbackLabel = getLocalizedUnknownLabel(t);

  if (!regionCode || typeof Intl.DisplayNames !== 'function') {
    return looksLikeReadableLabel(country) ? country.trim() : fallbackLabel;
  }

  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  const localizedLabel = displayNames.of(regionCode);

  if (!localizedLabel) {
    return looksLikeReadableLabel(country) ? country.trim() : fallbackLabel;
  }

  if (looksLikeCode(country) && normalizeCodeToken(localizedLabel) === normalizeCodeToken(regionCode)) {
    return fallbackLabel;
  }

  return localizedLabel;
}

export function getLocalizedLanguageLabel(
  language: string | null | undefined,
  locale: string,
  t?: TranslateFn,
): string {
  if (!language) return '';
  if (looksLikeReadableLabel(language)) return language.trim();

  const normalized = language.trim().replace(/_/g, '-');
  const aliasKey = normalized.replace(/-/g, '_').toUpperCase();
  const languageCode = LANGUAGE_ALIASES[aliasKey] ?? normalized;
  const fallbackLabel = getLocalizedUnknownLabel(t);

  if (typeof Intl.DisplayNames !== 'function') {
    return looksLikeReadableLabel(language) ? language.trim() : fallbackLabel;
  }

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
    const localizedLabel = displayNames.of(languageCode);

    if (!localizedLabel) {
      return looksLikeReadableLabel(language) ? language.trim() : fallbackLabel;
    }

    if (looksLikeCode(language) && normalizeCodeToken(localizedLabel) === normalizeCodeToken(languageCode)) {
      return fallbackLabel;
    }

    return localizedLabel;
  } catch {
    return looksLikeReadableLabel(language) ? language.trim() : fallbackLabel;
  }
}

export function getHospitalGenderShortLabel(
  gender: string | null | undefined,
  t: TranslateFn,
): string {
  const normalized = gender?.trim().toUpperCase();

  if (normalized === 'MALE' || normalized === 'M') {
    return t('hospital.common.genderMaleShort', undefined, 'M');
  }

  if (normalized === 'FEMALE' || normalized === 'F') {
    return t('hospital.common.genderFemaleShort', undefined, 'F');
  }

  if (!normalized) {
    return '';
  }

  return t('hospital.common.unknown', undefined, 'Unknown');
}
