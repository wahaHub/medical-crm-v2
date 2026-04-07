export function getPatientAppOrigin(): string {
  return (
    process.env['PATIENT_APP_ORIGIN']
    ?? process.env['CHINA_ORIGIN']
    ?? process.env['FRONTEND_URL']
    ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
}
