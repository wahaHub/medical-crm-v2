export interface EmailTemplateDTO {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
