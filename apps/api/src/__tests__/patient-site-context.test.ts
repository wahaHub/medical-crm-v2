import { afterEach, describe, expect, it } from 'vitest';
import { readPatientSiteContext, resolvePatientSiteContext, PatientSiteContextError } from '../patient-site-context.js';

const originalBeautyOrigin = process.env['BEAUTY_ORIGIN'];
const originalChinaOrigin = process.env['CHINA_ORIGIN'];
const originalPatientAppOrigin = process.env['PATIENT_APP_ORIGIN'];

function makeContext(url: string, headers: Record<string, string> = {}) {
  return {
    req: {
      url,
      header(name: string) {
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
      },
    },
  } as const;
}

describe('patient site context', () => {
  afterEach(() => {
    if (originalBeautyOrigin === undefined) {
      delete process.env['BEAUTY_ORIGIN'];
    } else {
      process.env['BEAUTY_ORIGIN'] = originalBeautyOrigin;
    }

    if (originalChinaOrigin === undefined) {
      delete process.env['CHINA_ORIGIN'];
    } else {
      process.env['CHINA_ORIGIN'] = originalChinaOrigin;
    }

    if (originalPatientAppOrigin === undefined) {
      delete process.env['PATIENT_APP_ORIGIN'];
    } else {
      process.env['PATIENT_APP_ORIGIN'] = originalPatientAppOrigin;
    }
  });

  it('resolves the explicit x-medora-site header first', () => {
    const context = makeContext('https://crm.medora.com/api/v2/patient/me', {
      'x-medora-site': 'beauty',
    });

    expect(resolvePatientSiteContext(context)).toBe('beauty');
  });

  it('falls back to the site query parameter for websocket-style requests', () => {
    const context = makeContext('https://crm.medora.com/ws/patient/notifications?site=china');

    expect(resolvePatientSiteContext(context)).toBe('china');
  });

  it('ignores the site query parameter on ordinary http requests', () => {
    const context = makeContext('https://crm.medora.com/api/v2/patient/me?site=china');

    expect(readPatientSiteContext(context)).toBeNull();
    expect(() => resolvePatientSiteContext(context)).toThrow(PatientSiteContextError);
  });

  it('falls back to configured origins when the browser cannot send custom headers', () => {
    process.env['BEAUTY_ORIGIN'] = 'https://beauty.medora.com';
    process.env['CHINA_ORIGIN'] = 'https://china.medora.com';

    expect(resolvePatientSiteContext(makeContext('https://crm.medora.com/ws/conversations/conv-1', {
      origin: 'https://beauty.medora.com',
    }))).toBe('beauty');
    expect(resolvePatientSiteContext(makeContext('https://crm.medora.com/ws/conversations/conv-1', {
      origin: 'https://china.medora.com',
    }))).toBe('china');
  });

  it('collapses invalid site hints instead of returning unvalidated values', () => {
    const context = makeContext('https://crm.medora.com/api/v2/patient/me?site=bogus', {
      'x-medora-site': 'bogus',
      origin: 'https://unknown.medora.com',
    });

    expect(readPatientSiteContext(context)).toBeNull();
    expect(() => resolvePatientSiteContext(context)).toThrow(PatientSiteContextError);
  });
});
