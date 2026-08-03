import type { IEmailService, IUserRepository, PatientSite } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import { getPatientAppOrigin } from '../patient-auth/patient-app-origin.js';

export class SendRecordsUploadConfirmationUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(input: {
    patientId: string;
    site: PatientSite;
    fileName: string;
    locale?: string | null;
  }): Promise<void> {
    const patient = await this.userRepo.findById(input.patientId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    await this.emailService.sendPatientRecordsUploadConfirmation({
      to: patient.email,
      patientName: patient.name,
      fileName: input.fileName,
      dashboardLink: `${getPatientAppOrigin(patient.patientSite ?? input.site)}/dashboard`,
      locale: input.locale ?? patient.preferredLanguage,
    });
  }
}
