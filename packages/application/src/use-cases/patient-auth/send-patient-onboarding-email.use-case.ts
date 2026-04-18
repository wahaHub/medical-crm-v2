import type { PatientAuthService, PatientSite } from '@medical-crm/domain';
import { getPatientAppOrigin } from './patient-app-origin.js';

export interface IPatientOnboardingEmailService {
  sendOnboardingEmail(params: {
    email: string;
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

export class SendPatientOnboardingEmailUseCase {
  constructor(
    private readonly authService: PatientAuthService,
    private readonly emailService: IPatientOnboardingEmailService,
  ) {}

  async execute(input: {
    email: string;
    site: PatientSite;
    locale?: string | null;
    summary: {
      country?: string | null;
      department?: string | null;
      condition?: string | null;
      destination?: string | null;
      treatmentTimeline?: string | null;
    };
  }): Promise<{ token: string }> {
    const token = await this.authService.createPatientLoginToken(input.email, input.site);
    const dashboardLink = `${getPatientAppOrigin(input.site)}/dashboard?token=${token}`;

    await this.emailService.sendOnboardingEmail({
      email: input.email,
      dashboardLink,
      locale: input.locale,
      summary: input.summary,
    });

    return { token };
  }
}
