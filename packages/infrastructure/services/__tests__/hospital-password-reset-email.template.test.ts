import { describe, expect, it } from 'vitest';
import { buildHospitalPasswordResetEmail } from '../hospital-password-reset-email.template.js';

describe('buildHospitalPasswordResetEmail', () => {
  it('renders a polished reset email with the magic link in HTML and text', () => {
    const email = buildHospitalPasswordResetEmail({
      hospitalName: 'Shanghai Medora Hospital',
      resetUrl: 'https://hospital.example.com/auth/reset-password?token=abc123',
      expiresInMinutes: 60,
      locale: 'zh',
    });

    expect(email.subject).toContain('重置医院端账户密码');
    expect(email.html).toContain('Shanghai Medora Hospital');
    expect(email.html).toContain('https://hospital.example.com/auth/reset-password?token=abc123');
    expect(email.html).toContain('重置密码');
    expect(email.text).toContain('Shanghai Medora Hospital');
    expect(email.text).toContain('https://hospital.example.com/auth/reset-password?token=abc123');
    expect(email.text).toContain('60');
  });
});
