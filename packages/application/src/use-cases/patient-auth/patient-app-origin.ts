import type { PatientSite } from '@medical-crm/domain';

export function getPatientAppOrigin(site?: PatientSite): string {
  const beautyOrigin = process.env['BEAUTY_ORIGIN'];
  const defaultOrigin =
    process.env['PATIENT_APP_ORIGIN']
    ?? process.env['CHINA_ORIGIN']
    ?? process.env['FRONTEND_URL']
    ?? 'http://localhost:3000';

  return (
    (site === 'beauty' ? beautyOrigin ?? defaultOrigin : defaultOrigin)
  ).replace(/\/+$/, '');
}
