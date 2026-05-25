import type { IEmailService } from '@medical-crm/domain';

export class StubEmailService implements IEmailService {
  async sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Hospital invitation to ${params.to} for ${params.hospitalName} (${params.locale ?? 'default'}): ${params.registrationUrl}`);
  }

  async sendHospitalPasswordReset(params: {
    to: string;
    hospitalName: string;
    resetUrl: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Hospital password reset to ${params.to} for ${params.hospitalName} (${params.locale ?? 'default'}): ${params.resetUrl}`);
  }

  async sendPatientMagicLink(params: {
    to: string;
    magicLink: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Patient magic link to ${params.to} (${params.locale ?? 'default'}): ${params.magicLink}`);
  }

  async sendPatientOnboardingConfirmation(params: {
    to: string;
    dashboardLink: string;
    locale?: string | null;
    summary: {
      country?: string | null;
      department?: string | null;
      condition?: string | null;
      destination?: string | null;
      treatmentTimeline?: string | null;
    };
  }): Promise<void> {
    console.log(
      `[STUB EMAIL] Patient onboarding confirmation to ${params.to} (${params.locale ?? 'default'}): ${params.dashboardLink} :: ${JSON.stringify(params.summary)}`,
    );
  }

  async sendAdminNewCaseAlert(params: {
    to: string;
    patientName: string;
    patientEmail: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Admin new case alert to ${params.to} (${params.locale ?? 'default'}): ${params.patientName} <${params.patientEmail}> :: ${params.adminPortalLink}`);
  }

  async sendAdminNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Admin new message alert to ${params.to} (${params.locale ?? 'default'}): ${params.patientName} :: ${params.messagePreview} :: ${params.adminPortalLink}`);
  }

  async sendAdminNewTicketAlert(params: {
    to: string;
    ticketNumber: string;
    patientName: string;
    subject: string;
    descriptionPreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Admin new ticket alert to ${params.to} (${params.locale ?? 'default'}): ${params.ticketNumber} :: ${params.patientName} :: ${params.subject} :: ${params.descriptionPreview} :: ${params.adminPortalLink}`);
  }

  async sendPatientNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    dashboardLink: string;
    locale?: string | null;
    replyTo?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Patient new message alert to ${params.to} (${params.locale ?? 'default'}): ${params.patientName} :: ${params.messagePreview} :: ${params.dashboardLink} :: replyTo=${params.replyTo ?? 'none'}`);
  }

  async sendPatientCaseUpdateAlert(params: {
    to: string;
    patientName: string;
    subject: string;
    messagePreview: string;
    bodyLines?: string[];
    dashboardLink: string;
    locale?: string | null;
    replyTo?: string | null;
  }): Promise<void> {
    console.log(`[STUB EMAIL] Patient case update to ${params.to} (${params.locale ?? 'default'}): ${params.subject} :: ${params.patientName} :: ${params.messagePreview} :: ${params.bodyLines?.join(' | ') ?? ''} :: ${params.dashboardLink} :: replyTo=${params.replyTo ?? 'none'}`);
  }
}
