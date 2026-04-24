import type { PatientSite } from '@medical-crm/domain';

const DEFAULT_PRODUCTION_CHINA_ORIGIN = 'https://www.medicaltourismchina.health';
const DEFAULT_PRODUCTION_BEAUTY_ORIGIN = 'https://www.medorabeauty.com';
const DEFAULT_DEVELOPMENT_ORIGIN = 'http://localhost:3000';

export function getPatientAppOrigin(site?: PatientSite): string {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const defaultChinaOrigin =
    process.env['PATIENT_APP_ORIGIN']
    ?? process.env['CHINA_ORIGIN']
    ?? process.env['FRONTEND_URL']
    ?? (isProduction ? DEFAULT_PRODUCTION_CHINA_ORIGIN : DEFAULT_DEVELOPMENT_ORIGIN);
  const beautyOrigin =
    process.env['BEAUTY_ORIGIN']
    ?? (isProduction ? DEFAULT_PRODUCTION_BEAUTY_ORIGIN : defaultChinaOrigin);

  return (
    (site === 'beauty' ? beautyOrigin : defaultChinaOrigin)
  ).replace(/\/+$/, '');
}
