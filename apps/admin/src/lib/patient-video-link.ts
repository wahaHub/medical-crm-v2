// Patient-facing video consultation link. Unlike the public guest link, this
// URL requires the booking patient's login — the API only issues a room token
// when the session patient owns the consultation.
const PATIENT_SITE_ORIGIN =
  process.env.NEXT_PUBLIC_CONSUMER_CHINA_ORIGIN
    ?? process.env.NEXT_PUBLIC_CONSUMER_REGULAR_ORIGIN
    ?? 'https://www.medicaltourismchina.health';

export function patientVideoConsultationLink(consultationId: string): string {
  return `${PATIENT_SITE_ORIGIN.replace(/\/+$/, '')}/video-consultation/${consultationId}`;
}
