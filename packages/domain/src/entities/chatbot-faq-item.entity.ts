export interface FaqAttachment {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface ChatbotFaqItemProps {
  id: string;
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  hospitalId: string | null;
  attachments: FaqAttachment[];
  translations?: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

export class ChatbotFaqItem {
  readonly id: string;
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  hospitalId: string | null;
  attachments: FaqAttachment[];
  translations: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: ChatbotFaqItemProps) {
    this.id = props.id;
    this.category = props.category;
    this.question = props.question;
    this.answer = props.answer;
    this.hospitalType = props.hospitalType;
    this.keywords = props.keywords;
    this.sortOrder = props.sortOrder;
    this.isActive = props.isActive;
    this.hospitalId = props.hospitalId;
    this.attachments = props.attachments;
    this.translations = props.translations ?? {};
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
