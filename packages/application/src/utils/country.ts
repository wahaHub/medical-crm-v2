const PHONE_COUNTRY_PREFIXES: Array<[string, string]> = [
  ['+1684', 'American Samoa'], ['+1671', 'Guam'], ['+1868', 'Trinidad and Tobago'],
  ['+1876', 'Jamaica'], ['+44', 'United Kingdom'], ['+86', 'China'], ['+81', 'Japan'],
  ['+82', 'South Korea'], ['+65', 'Singapore'], ['+61', 'Australia'], ['+64', 'New Zealand'],
  ['+91', 'India'], ['+971', 'United Arab Emirates'], ['+66', 'Thailand'], ['+55', 'Brazil'],
  ['+49', 'Germany'], ['+33', 'France'], ['+39', 'Italy'], ['+34', 'Spain'], ['+7', 'Russia'],
  ['+52', 'Mexico'], ['+27', 'South Africa'], ['+20', 'Egypt'],
];

export function deriveCountryFromPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const normalized = phone.trim().replace(/[()\s-]/g, '');
  if (!normalized.startsWith('+')) return null;
  return PHONE_COUNTRY_PREFIXES.find(([prefix]) => normalized.startsWith(prefix))?.[1] ?? null;
}

export function normalizeCountryCode(value?: string | null): string | null {
  const country = value?.trim().toUpperCase();
  if (!country || country === 'XX' || country === 'T1') return null;
  const names: Record<string, string> = {
    US: 'United States', GB: 'United Kingdom', CN: 'China', SG: 'Singapore', AU: 'Australia',
    CA: 'Canada', JP: 'Japan', KR: 'South Korea', DE: 'Germany', FR: 'France', IN: 'India',
    TH: 'Thailand', AE: 'United Arab Emirates', BR: 'Brazil', RU: 'Russia', ZA: 'South Africa',
  };
  return names[country] ?? (country.length === 2 ? country : null);
}
