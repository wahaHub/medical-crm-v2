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
}
