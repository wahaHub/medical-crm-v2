export interface ChatbotFaqItemDTO {
  id: string;
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
