type HospitalConsumerLinkInput = {
  id: string;
  type: string;
  consumerSlug?: string | null;
};

const CONSUMER_REGULAR_ORIGIN =
  process.env.NEXT_PUBLIC_CONSUMER_REGULAR_ORIGIN ?? 'https://www.medicaltourismchina.health';
const CONSUMER_COSMETIC_ORIGIN =
  process.env.NEXT_PUBLIC_CONSUMER_COSMETIC_ORIGIN ?? 'https://www.medorabeauty.com';
const REGULAR_HOSPITAL_PATH_TEMPLATE =
  process.env.NEXT_PUBLIC_CONSUMER_REGULAR_HOSPITAL_PATH_TEMPLATE ?? '/hospitals/{consumerSlug}';
const COSMETIC_HOSPITAL_PATH_TEMPLATE =
  process.env.NEXT_PUBLIC_CONSUMER_COSMETIC_HOSPITAL_PATH_TEMPLATE ?? '/hospital/{consumerSlug}';

function joinUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function fillTemplate(template: string, hospital: HospitalConsumerLinkInput): string {
  return template
    .replaceAll('{hospitalId}', hospital.id)
    .replaceAll('{hospitalType}', String(hospital.type ?? '').toLowerCase())
    .replaceAll('{consumerSlug}', hospital.consumerSlug ?? '');
}

export function buildConsumerShowcaseUrl(
  hospital: HospitalConsumerLinkInput,
): string | null {
  if (!hospital.consumerSlug) {
    return null;
  }

  const isRegular = hospital.type === 'REGULAR';
  const consumerOrigin = isRegular ? CONSUMER_REGULAR_ORIGIN : CONSUMER_COSMETIC_ORIGIN;
  const template = isRegular ? REGULAR_HOSPITAL_PATH_TEMPLATE : COSMETIC_HOSPITAL_PATH_TEMPLATE;

  return joinUrl(consumerOrigin, fillTemplate(template, hospital));
}
