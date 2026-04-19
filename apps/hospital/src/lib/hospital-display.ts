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

export function getHospitalStatusLabel(status: string | null | undefined, t: TranslateFn): string {
  const normalized = status?.trim().toUpperCase() || 'UNKNOWN';
  const meta = STATUS_LABELS[normalized];

  if (meta) {
    return t(meta.key, undefined, meta.fallback);
  }

  return normalized.replace(/_/g, ' ');
}

export function formatDurationMinutesLabel(minutes: number, t: TranslateFn): string {
  return t('hospital.common.durationMinutes', { count: minutes }, `${minutes} min`);
}

export function getLocalizedCountryLabel(
  country: string | null | undefined,
  locale: string,
): string {
  if (!country) return '';

  const normalized = country.trim().toUpperCase();
  const regionCode =
    REGION_ALIASES[normalized] ??
    (/^[A-Z]{2}$/.test(normalized) ? normalized : undefined);

  if (!regionCode || typeof Intl.DisplayNames !== 'function') {
    return country;
  }

  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  return displayNames.of(regionCode) ?? country;
}

export function getLocalizedLanguageLabel(
  language: string | null | undefined,
  locale: string,
): string {
  if (!language) return '';

  const normalized = language.trim().replace(/_/g, '-');
  const aliasKey = normalized.replace(/-/g, '_').toUpperCase();
  const languageCode = LANGUAGE_ALIASES[aliasKey] ?? normalized;

  if (typeof Intl.DisplayNames !== 'function') {
    return language;
  }

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
    return displayNames.of(languageCode) ?? language;
  } catch {
    return language;
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

  return gender ?? '';
}
