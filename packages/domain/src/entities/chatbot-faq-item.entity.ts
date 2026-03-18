export interface ChatbotFaqItemProps {
  id: string;
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ChatbotFaqItem {
  readonly id: string;
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywords: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: ChatbotFaqItemProps) {
    this.id = props.id;
    this.category = props.category;
    this.questionEn = props.questionEn;
    this.questionZh = props.questionZh;
    this.answerEn = props.answerEn;
    this.answerZh = props.answerZh;
    this.keywords = props.keywords;
    this.sortOrder = props.sortOrder;
    this.isActive = props.isActive;
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
