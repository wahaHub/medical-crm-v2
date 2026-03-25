export interface EmailTemplateAttachmentDTO {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  url: string;
}

export interface EmailTemplateDTO {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  attachments: EmailTemplateAttachmentDTO[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
