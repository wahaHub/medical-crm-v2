import { beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { ResendEmailService } from '../resend-email.service.js';
import { SmtpEmailService } from '../smtp-email.service.js';
import { buildPatientNewMessageEmail } from '../patient-new-message-email.template.js';
import { fetchWithEmailTimeout } from '../email-delivery.utils.js';

vi.mock('../email-delivery.utils.js', () => ({
  fetchWithEmailTimeout: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

const replyAddress = 'reply+0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@medicaltourismchina.health';
const formattedReplyTo = `Medora Reply <${replyAddress}>`;
const patientFrom = 'Medora Care Team <customer@medicaltourismchina.health>';

describe('ResendEmailService patient notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithEmailTimeout).mockResolvedValue({
      ok: true,
    } as Response);
  });

  it('uses the fixed patient sender and reply_to for new message alerts', async () => {
    const service = new ResendEmailService({
      apiKey: 'resend-test-key',
      from: 'Configured Sender <configured@example.com>',
    });

    await service.sendPatientNewMessageAlert({
      to: 'patient@example.com',
      patientName: 'Patient One',
      messagePreview: 'Your care team replied.',
      dashboardLink: 'https://patient.example.com/dashboard',
      replyTo: replyAddress,
    });

    const request = vi.mocked(fetchWithEmailTimeout).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      from: patientFrom,
      reply_to: formattedReplyTo,
      to: ['patient@example.com'],
    }));
  });

  it('uses the fixed patient sender and reply_to for case update alerts', async () => {
    const service = new ResendEmailService({
      apiKey: 'resend-test-key',
      from: 'Configured Sender <configured@example.com>',
    });

    await service.sendPatientCaseUpdateAlert({
      to: 'patient@example.com',
      patientName: 'Patient One',
      subject: 'Your plan is ready',
      messagePreview: 'Your care plan is ready.',
      dashboardLink: 'https://patient.example.com/dashboard',
      replyTo: replyAddress,
    });

    const request = vi.mocked(fetchWithEmailTimeout).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      from: patientFrom,
      reply_to: formattedReplyTo,
      to: ['patient@example.com'],
    }));
  });

  it('sends medical records upload confirmations through Resend', async () => {
    const service = new ResendEmailService({
      apiKey: 'resend-test-key',
      from: 'Configured Sender <configured@example.com>',
    });

    await service.sendPatientRecordsUploadConfirmation({
      to: 'patient@example.com',
      patientName: 'Patient One',
      fileName: 'report.pdf',
      dashboardLink: 'https://patient.example.com/dashboard',
      locale: 'en',
    });

    const request = vi.mocked(fetchWithEmailTimeout).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      from: patientFrom,
      to: ['patient@example.com'],
      subject: "We've received your medical records",
      text: expect.stringContaining('report.pdf'),
    }));
  });
});

describe('SmtpEmailService patient notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it('uses the fixed patient sender and replyTo for new message alerts', async () => {
    const service = new SmtpEmailService({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user',
      pass: 'pass',
      from: 'Configured Sender <configured@example.com>',
    });

    await service.sendPatientNewMessageAlert({
      to: 'patient@example.com',
      patientName: 'Patient One',
      messagePreview: 'Your care team replied.',
      dashboardLink: 'https://patient.example.com/dashboard',
      replyTo: replyAddress,
    });

    const transporter = vi.mocked(nodemailer.createTransport).mock.results[0]?.value as {
      sendMail: ReturnType<typeof vi.fn>;
    };
    expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: patientFrom,
      replyTo: formattedReplyTo,
      to: 'patient@example.com',
    }));
  });
});

describe('buildPatientNewMessageEmail', () => {
  it('uses a safe non-replying footer when reply routing is not enabled', () => {
    const email = buildPatientNewMessageEmail({
      patientName: 'Patient One',
      messagePreview: 'Your care team replied.',
      dashboardLink: 'https://patient.example.com/dashboard',
    });

    expect(email.text).toContain('Please do not reply directly to this message.');
    expect(email.text).not.toContain(
      'You can reply directly to this email. Your message and attachments will be added to your Medora case.',
    );
  });

  it('tells patients they can reply directly when reply routing is enabled', () => {
    const email = buildPatientNewMessageEmail({
      patientName: 'Patient One',
      messagePreview: 'Your care team replied.',
      dashboardLink: 'https://patient.example.com/dashboard',
      replyEnabled: true,
    });

    expect(email.text).toContain(
      'You can reply directly to this email. Your message and attachments will be added to your Medora case.',
    );
    expect(email.text).not.toContain('Please do not reply directly to this message.');
  });
});
