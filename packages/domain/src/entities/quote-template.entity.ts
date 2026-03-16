export interface QuoteTemplateProps {
  id: string;
  hospitalId: string;
  name: string;
  conditionCategory: string | null;
  lineItemsTemplate: unknown;
  defaultValidDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class QuoteTemplate {
  readonly id: string;
  readonly hospitalId: string;
  name: string;
  conditionCategory: string | null;
  lineItemsTemplate: unknown;
  defaultValidDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: QuoteTemplateProps) {
    this.id = props.id;
    this.hospitalId = props.hospitalId;
    this.name = props.name;
    this.conditionCategory = props.conditionCategory;
    this.lineItemsTemplate = props.lineItemsTemplate;
    this.defaultValidDays = props.defaultValidDays;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  update(data: Partial<Pick<QuoteTemplateProps, 'name' | 'conditionCategory' | 'lineItemsTemplate' | 'defaultValidDays'>>): void {
    if (data.name !== undefined) this.name = data.name;
    if (data.conditionCategory !== undefined) this.conditionCategory = data.conditionCategory;
    if (data.lineItemsTemplate !== undefined) this.lineItemsTemplate = data.lineItemsTemplate;
    if (data.defaultValidDays !== undefined) this.defaultValidDays = data.defaultValidDays;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
