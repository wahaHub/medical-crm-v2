import type { EmailTemplate } from '../entities/email-template.entity.js';

export interface EmailTemplateListQuery {
  page: number;
  limit: number;
  type?: string;
  status?: string;
}

export interface IEmailTemplateRepository {
  findById(id: string): Promise<EmailTemplate | null>;
  findByHospital(hospitalId: string, query: EmailTemplateListQuery): Promise<{ data: EmailTemplate[]; total: number }>;
  save(entity: EmailTemplate): Promise<EmailTemplate>;
  softDelete(id: string): Promise<void>;
}
