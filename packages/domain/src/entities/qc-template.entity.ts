export interface QCTemplateProps {
  id: string;
  templateName: string;
  category: string;
  procedureTypes: string[];
  questions: unknown;
  version: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class QCTemplate {
  readonly id: string;
  templateName: string;
  category: string;
  procedureTypes: string[];
  questions: unknown;
  version: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: QCTemplateProps) {
    this.id = props.id;
    this.templateName = props.templateName;
    this.category = props.category;
    this.procedureTypes = props.procedureTypes;
    this.questions = props.questions;
    this.version = props.version;
    this.isActive = props.isActive;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  update(data: Partial<Pick<QCTemplateProps, 'templateName' | 'category' | 'procedureTypes' | 'questions' | 'isActive'>>): void {
    if (data.templateName !== undefined) this.templateName = data.templateName;
    if (data.category !== undefined) this.category = data.category;
    if (data.procedureTypes !== undefined) this.procedureTypes = data.procedureTypes;
    if (data.questions !== undefined) this.questions = data.questions;
    if (data.isActive !== undefined) this.isActive = data.isActive;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
