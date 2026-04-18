export interface IEmailService {
  sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
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
}
