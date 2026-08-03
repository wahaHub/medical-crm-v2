export interface IEmailService {
  sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
    locale?: string | null;
  }): Promise<void>;
  sendHospitalPasswordReset(params: {
    to: string;
    hospitalName: string;
    resetUrl: string;
    locale?: string | null;
  }): Promise<void>;
  sendPatientMagicLink(params: {
    to: string;
    magicLink: string;
    locale?: string | null;
  }): Promise<void>;
  sendPatientOnboardingConfirmation(params: {
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
  }): Promise<void>;
  sendPatientRecordsUploadConfirmation(params: {
    to: string;
    patientName: string;
    fileName: string;
    dashboardLink: string;
    locale?: string | null;
  }): Promise<void>;
  sendAdminNewCaseAlert(params: {
    to: string;
    patientName: string;
    patientEmail: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void>;
  sendAdminNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void>;
  sendAdminNewTicketAlert(params: {
    to: string;
    ticketNumber: string;
    patientName: string;
    subject: string;
    descriptionPreview: string;
    adminPortalLink: string;
    locale?: string | null;
  }): Promise<void>;
  sendPatientNewMessageAlert(params: {
    to: string;
    patientName: string;
    messagePreview: string;
    dashboardLink: string;
    locale?: string | null;
    replyTo?: string | null;
  }): Promise<void>;
  sendPatientCaseUpdateAlert(params: {
    to: string;
    patientName: string;
    subject: string;
    messagePreview: string;
    bodyLines?: string[];
    dashboardLink: string;
    locale?: string | null;
    replyTo?: string | null;
  }): Promise<void>;
}
