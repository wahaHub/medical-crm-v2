import type { ChatbotFaqItem } from '../entities/chatbot-faq-item.entity.js';

export interface ChatbotFaqListQuery {
  page: number;
  limit: number;
  category?: string;
  hospitalType?: 'REGULAR' | 'COSMETIC';
  isActive?: boolean;
  search?: string;
  hospitalId?: string | null;
}

export interface ChatbotFaqCategory {
  id: string;
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  hospitalId: string | null;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
  translations: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatbotFaqCategoryListQuery {
  hospitalType?: 'REGULAR' | 'COSMETIC';
  isActive?: boolean;
  hospitalId?: string | null;
}

export interface IChatbotFaqRepository {
  findById(id: string): Promise<ChatbotFaqItem | null>;
  findAll(query: ChatbotFaqListQuery): Promise<{ data: ChatbotFaqItem[]; total: number }>;
  listCategories(query: ChatbotFaqCategoryListQuery): Promise<ChatbotFaqCategory[]>;
  findCategoryById(id: string): Promise<ChatbotFaqCategory | null>;
  createCategory(input: {
    name: string;
    hospitalType: 'REGULAR' | 'COSMETIC';
    hospitalId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ChatbotFaqCategory>;
  updateCategory(id: string, input: {
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ChatbotFaqCategory>;
  countItemsForCategory(name: string, hospitalType: 'REGULAR' | 'COSMETIC', hospitalId?: string | null): Promise<number>;
  save(entity: ChatbotFaqItem): Promise<ChatbotFaqItem>;
  delete(id: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
}
