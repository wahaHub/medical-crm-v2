export interface QCCustomizationProps {
  id: string;
  templateId: string;
  hospitalId: string;
  customizedQuestions: unknown;
  customizedBy: string | null;
  customizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class QCCustomization {
  readonly id: string;
  templateId: string;
  hospitalId: string;
  customizedQuestions: unknown;
  customizedBy: string | null;
  customizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: QCCustomizationProps) {
    this.id = props.id;
    this.templateId = props.templateId;
    this.hospitalId = props.hospitalId;
    this.customizedQuestions = props.customizedQuestions;
    this.customizedBy = props.customizedBy;
    this.customizedAt = props.customizedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  update(questions: unknown, userId: string): void {
    this.customizedQuestions = questions;
    this.customizedBy = userId;
    this.customizedAt = new Date();
    this.updatedAt = new Date();
  }
}
