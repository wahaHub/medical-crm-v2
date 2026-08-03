import { describe, expect, it } from 'vitest';
import { buildPatientRecordsUploadEmail } from '../patient-records-upload-email.template.js';

describe('buildPatientRecordsUploadEmail', () => {
  it('renders the uploaded file and next steps in English', () => {
    const email = buildPatientRecordsUploadEmail({
      patientName: 'Patient One',
      fileName: 'pathology-report.pdf',
      dashboardLink: 'https://www.medicaltourismchina.health/dashboard',
      locale: 'en',
    });

    expect(email.subject).toBe("We've received your medical records");
    expect(email.text).toContain('pathology-report.pdf');
    expect(email.text).toContain('Our medical team will review');
    expect(email.text).toContain('online consultation with a doctor in China');
    expect(email.html).toContain('https://www.medicaltourismchina.health/dashboard');
  });

  it('renders Chinese copy and escapes patient-controlled values in HTML', () => {
    const email = buildPatientRecordsUploadEmail({
      patientName: '<Patient>',
      fileName: '<scan>.pdf',
      dashboardLink: 'https://www.medicaltourismchina.health/dashboard',
      locale: 'zh-CN',
    });

    expect(email.subject).toBe('我们已收到您的医疗资料');
    expect(email.text).toContain('<scan>.pdf');
    expect(email.html).toContain('&lt;Patient&gt;');
    expect(email.html).toContain('&lt;scan&gt;.pdf');
    expect(email.html).not.toContain('<scan>.pdf');
  });
});
