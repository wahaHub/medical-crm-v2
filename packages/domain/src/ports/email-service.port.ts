export interface IEmailService {
  sendHospitalInvitation(params: {
    to: string;
    hospitalName: string;
    registrationUrl: string;
  }): Promise<void>;
}
