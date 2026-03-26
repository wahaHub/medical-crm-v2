export interface FaqAttachmentDTO {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
}

export interface ChatbotFaqItemDTO {
  id: string;
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  hospitalId: string | null;
  attachments: FaqAttachmentDTO[];
  translations: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotFaqCategoryDTO {
  id: string;
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
  translations: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}
