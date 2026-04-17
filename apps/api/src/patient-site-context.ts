import type { Context } from 'hono';
import type { PatientSite } from '@medical-crm/domain';

export class PatientSiteContextError extends Error {
  constructor(message = 'Missing or invalid patient site context') {
    super(message);
    this.name = 'PatientSiteContextError';
  }
}

function normalizePatientSite(rawSite: string | null | undefined): PatientSite | null {
  const site = rawSite?.trim().toLowerCase();
  if (site === 'beauty' || site === 'china') {
    return site;
  }
  return null;
}

function normalizeOrigin(rawOrigin: string | null | undefined): string | null {
  if (!rawOrigin) {
    return null;
  }

  try {
    return new URL(rawOrigin).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isWebsocketStyleRequest(reqUrl: string): boolean {
  return new URL(reqUrl).pathname.startsWith('/ws/');
}

export function readPatientSiteContext(c: Pick<Context, 'req'>): PatientSite | null {
  const headerSite = normalizePatientSite(c.req.header('x-medora-site'));
  if (headerSite) {
    return headerSite;
  }

  if (isWebsocketStyleRequest(c.req.url)) {
    const querySite = normalizePatientSite(new URL(c.req.url).searchParams.get('site'));
    if (querySite) {
      return querySite;
    }
  }

  const requestOrigin = normalizeOrigin(c.req.header('origin'));
  if (!requestOrigin) {
    return null;
  }

  const beautyOrigin = normalizeOrigin(process.env['BEAUTY_ORIGIN']);
  if (beautyOrigin && requestOrigin === beautyOrigin) {
    return 'beauty';
  }

  const chinaOrigins = [
    process.env['PATIENT_APP_ORIGIN'],
    process.env['CHINA_ORIGIN'],
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
  if (chinaOrigins.includes(requestOrigin)) {
    return 'china';
  }

  return null;
}

export function resolvePatientSiteContext(c: Pick<Context, 'req'>): PatientSite {
  const site = readPatientSiteContext(c);
  if (site) {
    return site;
  }
  throw new PatientSiteContextError();
}
