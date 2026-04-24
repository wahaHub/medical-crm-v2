import { afterEach, describe, expect, it } from 'vitest';
import { getPatientAppOrigin } from '../../src/use-cases/patient-auth/patient-app-origin.js';

const originalNodeEnv = process.env['NODE_ENV'];
const originalBeautyOrigin = process.env['BEAUTY_ORIGIN'];
const originalChinaOrigin = process.env['CHINA_ORIGIN'];
const originalPatientAppOrigin = process.env['PATIENT_APP_ORIGIN'];
const originalFrontendUrl = process.env['FRONTEND_URL'];

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe('getPatientAppOrigin', () => {
  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('BEAUTY_ORIGIN', originalBeautyOrigin);
    restoreEnv('CHINA_ORIGIN', originalChinaOrigin);
    restoreEnv('PATIENT_APP_ORIGIN', originalPatientAppOrigin);
    restoreEnv('FRONTEND_URL', originalFrontendUrl);
  });

  it('uses production-safe public origins when patient app envs are missing', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['BEAUTY_ORIGIN'];
    delete process.env['CHINA_ORIGIN'];
    delete process.env['PATIENT_APP_ORIGIN'];
    delete process.env['FRONTEND_URL'];

    expect(getPatientAppOrigin('china')).toBe('https://www.medicaltourismchina.health');
    expect(getPatientAppOrigin('beauty')).toBe('https://www.medorabeauty.com');
  });

  it('keeps localhost defaults for non-production development flows', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['BEAUTY_ORIGIN'];
    delete process.env['CHINA_ORIGIN'];
    delete process.env['PATIENT_APP_ORIGIN'];
    delete process.env['FRONTEND_URL'];

    expect(getPatientAppOrigin('china')).toBe('http://localhost:3000');
    expect(getPatientAppOrigin('beauty')).toBe('http://localhost:3000');
  });
});
