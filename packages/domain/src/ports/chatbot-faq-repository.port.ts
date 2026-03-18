import type { ChatbotFaqItem } from '../entities/chatbot-faq-item.entity.js';

export interface ChatbotFaqListQuery {
  page: number;
  limit: number;
  category?: string;
  isActive?: boolean;
  search?: string;
}

export interface IChatbotFaqRepository {
  findById(id: string): Promise<ChatbotFaqItem | null>;
  findAll(query: ChatbotFaqListQuery): Promise<{ data: ChatbotFaqItem[]; total: number }>;
  save(entity: ChatbotFaqItem): Promise<ChatbotFaqItem>;
  delete(id: string): Promise<void>;
}
