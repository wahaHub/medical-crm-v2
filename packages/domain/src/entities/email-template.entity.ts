export interface EmailTemplateProps {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class EmailTemplate {
  readonly id: string;
  readonly hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(props: EmailTemplateProps) {
    this.id = props.id;
    this.hospitalId = props.hospitalId;
    this.name = props.name;
    this.type = props.type;
    this.subject = props.subject;
    this.body = props.body;
    this.variables = props.variables;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }

  update(data: Partial<Pick<EmailTemplateProps, 'name' | 'type' | 'subject' | 'body' | 'variables' | 'status'>>): void {
    if (data.name !== undefined) this.name = data.name;
    if (data.type !== undefined) this.type = data.type;
    if (data.subject !== undefined) this.subject = data.subject;
    if (data.body !== undefined) this.body = data.body;
    if (data.variables !== undefined) this.variables = data.variables;
    if (data.status !== undefined) this.status = data.status;
    this.updatedAt = new Date();
  }

  softDelete(): void {
    this.deletedAt = new Date();
    this.updatedAt = new Date();
  }
}
