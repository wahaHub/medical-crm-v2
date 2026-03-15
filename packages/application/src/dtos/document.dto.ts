export interface DocumentDTO {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
  isTranslated: boolean;
  downloadUrl: string;
  createdAt: string;
}

export type DocumentWithUrlDTO = DocumentDTO;
